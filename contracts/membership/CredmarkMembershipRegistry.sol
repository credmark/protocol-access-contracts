// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./CredmarkMembershipToken.sol";
import "./CredmarkMembershipTier.sol";
import "./CredmarkMembershipRewardsPool.sol";
import "../oracle/TokenOracles.sol";

contract CredmarkMembershipRegistry is AccessControl {
    bytes32 public constant REGISTRY_MANAGER = keccak256("REGISTRY_MANAGER");

    TokenOracles public tokenOracle;
    CredmarkMembershipToken public membershipToken;
    CredmarkMembershipTier[] public tiers;
    CredmarkMembershipRewardsPool[] public rewardsPools;
    mapping(address => bool) public exists;

    address public treasury;

    mapping(uint256 => CredmarkMembershipTier) public subscriptions;

    mapping(CredmarkMembershipTier => CredmarkMembershipRewardsPool)
        public rewardsPoolByTier;
    mapping(CredmarkMembershipRewardsPool => CredmarkMembershipTier[])
        public tiersByRewardsPool;

    constructor(address registryManager) {
        _grantRole(REGISTRY_MANAGER, msg.sender);
        _grantRole(REGISTRY_MANAGER, registryManager);
    }

    // TIERS //

    function tierExists(CredmarkMembershipTier tier)
        internal
        view
        returns (bool)
    {
        return exists[address(tier)];
    }

    function addTier(CredmarkMembershipTier tier)
        external
        onlyRole(REGISTRY_MANAGER)
    {
        tiers.push(tier);
        exists[address(tier)] = true;
    }

    function tierCount() external view returns (uint256) {
        return tiers.length;
    }

    // ORACLES //

    function addOracle(TokenOracles _tokenOracle)
        external
        onlyRole(REGISTRY_MANAGER)
    {
        tokenOracle = _tokenOracle;
    }

    // REWARDS POOLS //

    function addRewardsPool(CredmarkMembershipRewardsPool rewardsPool)
        external
        onlyRole(REGISTRY_MANAGER)
    {
        require(!exists[address(rewardsPool)], "RewardsPool already exists.");
        rewardsPools.push(rewardsPool);
        exists[address(rewardsPool)] = true;
    }

    function rewardsPoolsLength() external view returns (uint256) {
        return rewardsPools.length;
    }

    function setTierRewardsPool(
        CredmarkMembershipTier tier,
        CredmarkMembershipRewardsPool rewardsPool
    ) external onlyRole(REGISTRY_MANAGER) {
        require(exists[address(tier)], "Tier doesn't Exist.");
        require(exists[address(rewardsPool)], "RewardsPool doesn't Exist.");
        rewardsPoolByTier[tier] = rewardsPool;
        tiersByRewardsPool[rewardsPool].push(tier);
    }

    // TREASURY //

    function setTreasury(address _treasury)
        external
        onlyRole(REGISTRY_MANAGER)
    {
        treasury = _treasury;
    }

    // MEMBERSHIP //

    function setMembershipToken(CredmarkMembershipToken _membershipToken)
        external
        onlyRole(REGISTRY_MANAGER)
    {
        require(
            address(membershipToken) == address(0),
            "MembershipToken already exists"
        );
        membershipToken = _membershipToken;
    }

    function subscribe(uint256 tokenId, CredmarkMembershipTier tier)
        external
        onlyRole(REGISTRY_MANAGER)
    {
        require(exists[address(tier)], "Tier doesn't Exist.");
        subscriptions[tokenId] = tier;
    }

    function subscription(uint256 tokenId)
        external
        view
        returns (CredmarkMembershipTier)
    {
        return subscriptions[tokenId];
    }

    function rewardsTokenByTier(CredmarkMembershipTier tier)
        external
        view
        returns (IERC20)
    {
        return rewardsPoolByTier[tier].rewardsToken();
    }

    function tierCountForRewardsPool(CredmarkMembershipRewardsPool rewardsPool)
        external
        view
        returns (uint256)
    {
        return tiersByRewardsPool[rewardsPool].length;
    }
}
