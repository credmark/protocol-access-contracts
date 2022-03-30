// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IPriceOracle.sol";
import "./CredmarkMembershipRegistry.sol";
import "./CredmarkMembershipTier.sol";


contract CredmarkMembershipRewardsPool is AccessControl {
    IERC20 public rewardsToken;
    CredmarkMembershipRegistry private registry;
    bytes32 public constant REWARDS_MANAGER = keccak256("REWARDS_MANAGER");

    uint public totalShares;
    uint public tokensPerSecond;
    uint public startTimestamp;

    mapping(address=>uint) public shares;
    mapping(address=>uint) public globalRewardsSnapshots;    
    uint public snapshotTimestamp;

    constructor(
        IERC20 _rewardsToken, 
        CredmarkMembershipRegistry _registry,
        address _membershipAddress) {
            _setupRole(REWARDS_MANAGER, _membershipAddress);
            SafeERC20.safeApprove(_rewardsToken, _membershipAddress, _rewardsToken.totalSupply());
            rewardsToken = _rewardsToken;
            registry = _registry;
    }

    function start() external onlyRole(REWARDS_MANAGER) {
        require(totalShares > 0, "No Deposits in tiers");
        startTimestamp = block.timestamp;
    }

    function setTokensPerSecond(uint _tokensPerSecond) external onlyRole(REWARDS_MANAGER) {
        snapshot();
        tokensPerSecond = _tokensPerSecond;
    }

    function snapshot() external {
        uint tierCount = registry.tierCountForRewardsPool(address(this));
        uint sharesSum = 0;

        for(uint i = 0; i < tierCount; i++){
            CredmarkMembershipTier tier =  registry.tiersByRewardsPool[address(this)][i];
            share = tier.totalDeposits * tier.multiplier();
            if (tier.baseToken() != rewardsToken){
                IPriceOracle baseOracle = registry.oracles[tier.baseToken()];
                IPriceOracle rewardsOracle = registry.oracles[rewardsToken];
                share = share * (baseOracle.getPrice() * (10**rewardsOracle.decimals())) / 
                    (rewardsOracle.getPrice() * (10**baseOracle.decimals()));
            }
            sharesSum += share;
            globalRewardsSnapshots[tier] = globalTierRewards(tier);
            shareSnapshots[tier] = share;
        }
        totalShares = sharesSum;
    }

    function globalTierRewards(CredmarkMembershipTier tier) public returns (uint){
        return  globalRewardsSnapshots[tier] + (shareSnapshots[tier] * (block.timestamp - snapshotTimestamp) * tokensPerSecond / totalShares);
    }
}