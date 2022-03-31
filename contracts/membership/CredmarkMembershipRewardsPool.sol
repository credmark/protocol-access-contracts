// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IPriceOracle.sol";
import "./CredmarkMembershipRegistry.sol";
import "./CredmarkMembershipTier.sol";


contract CredmarkMembershipRewardsPool is AccessControl {
    using SafeERC20 for IERC20;
    
    IERC20 public rewardsToken;
    CredmarkMembershipRegistry private registry;
    bytes32 public constant REWARDS_MANAGER = keccak256("REWARDS_MANAGER");

    uint public totalShares;
    uint public tokensPerSecond;
    uint public startTimestamp;

    mapping(address=>uint) public shares;
    mapping(address=>uint) public globalRewardsSnapshots;

    uint public lastSnapshotTimestamp;

    constructor(
        IERC20 _rewardsToken, 
        CredmarkMembershipRegistry _registry,
        address _membershipAddress) {
            grantRole(REWARDS_MANAGER, _membershipAddress);
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

    function snapshot() public {
        require(block.timestamp >= lastSnapshotTimestamp, "ERROR:block.timestamp");
        uint tierCount = registry.tierCountForRewardsPool(address(this));
        for(uint i = 0; i < tierCount; i++){
            CredmarkMembershipTier tier =  registry.tiersByRewardsPool[address(this)][i];
            globalRewardsSnapshots[tier] = globalTierRewards(tier);
        }
        lastSnapshotTimestamp = block.timestamp;
    }

    function updateTierRewards(CredmarkMembershipTier tier) public returns (uint256) {
        require(registry.rewardsPools[tier] == address(this), "ERROR: Not subscribed");
        snapshot();
        
        uint newShares = tier.totalDeposits * tier.multiplier();

        if (tier.baseToken() != rewardsToken){
            (uint price, uint decimals) = registry.oracle.getLatestRelative(tier.baseToken(), rewardsToken);
            // ensure decimals ends up correct
            newShares = newShares * price / (10**decimals);
        }

        uint newTotalShares = totalShares + newShares - shares[msg.sender];
    }

    function globalTierRewards(CredmarkMembershipTier tier) public returns (uint){
        return  globalRewardsSnapshots[tier] + (shares[tier] * (block.timestamp - lastSnapshotTimestamp) * tokensPerSecond / totalShares);
    }
}