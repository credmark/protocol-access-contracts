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
    bytes32 public constant REGISTRY_MANAGER_ROLE = keccak256("REGISTRY_MANAGER_ROLE");

    uint256 public totalShares;
    uint256 public tokensPerSecond;
    uint256 public startTimestamp;

    mapping(address => uint256) public shares;
    mapping(address => uint256) public globalRewardsSnapshots;

    uint256 public lastSnapshotTimestamp;

    constructor(
        CredmarkMembershipRegistry _registry,
        IERC20 _rewardsToken,
        address _membershipToken
    ) {
        SafeERC20.safeApprove(
            _rewardsToken,
            _membershipToken,
            _rewardsToken.totalSupply()
        );
        rewardsToken = _rewardsToken;
        registry = _registry;
    }

    function start() external onlyRole(REGISTRY_MANAGER_ROLE) {
        require(totalShares > 0, "No Deposits in tiers");
        startTimestamp = block.timestamp;
    }

    function setTokensPerSecond(uint256 _tokensPerSecond)
        external
        onlyRole(REGISTRY_MANAGER_ROLE)
    {
        snapshot();
        tokensPerSecond = _tokensPerSecond;
    }

    function snapshot() public {
        require(
            block.timestamp >= lastSnapshotTimestamp,
            "ERROR:block.timestamp"
        );
        uint256 tierCount = registry.tierCountForRewardsPool(this);
        for (uint256 i = 0; i < tierCount; i++) {
            CredmarkMembershipTier tier = registry.tiersByRewardsPool(this, i);
            globalRewardsSnapshots[address(tier)] = globalTierRewards(tier);
        }
        lastSnapshotTimestamp = block.timestamp;
    }

    function updateTierRewards(CredmarkMembershipTier tier)
        public
        returns (uint256)
    {
        snapshot();

        uint256 newShares = tier.totalDeposits() * tier.multiplier();

        if (tier.baseToken() != rewardsToken) {
            (uint256 price, uint256 decimals) = registry
                .tokenOracle()
                .getLatestRelative(tier.baseToken(), rewardsToken);
            // ensure decimals ends up correct
            newShares = (newShares * price) / (10**decimals);
        }

        uint256 newTotalShares = totalShares + newShares - shares[msg.sender];
        return newTotalShares;
    }

    function globalTierRewards(CredmarkMembershipTier tier)
        public
        view
        returns (uint256)
    {
        return
            globalRewardsSnapshots[address(tier)] +
            ((shares[address(tier)] *
                (block.timestamp - lastSnapshotTimestamp) *
                tokensPerSecond) / totalShares);
    }
}
