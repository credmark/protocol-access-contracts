// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IPriceOracle.sol";
import "../interfaces/IRewardsPool.sol";
import "./CredmarkMembershipToken.sol";
import "./CredmarkMembershipTier.sol";
import "./CredmarkMembershipRewardsPool.sol";
import "./CredmarkMembership.sol";


contract CredmarkMembershipRegistry is AccessControl {

    bytes32 public constant REGISTRY_MANAGER = keccak256("REGISTRY_MANAGER");

    mapping(IERC20 => IPriceOracle) public oracles;
    mapping(CredmarkMembershipTier => CredmarkMembershipRewardsPool) public rewardsPoolByTier;
    mapping(CredmarkMembershipRewardsPool => CredmarkMembershipTier[]) public tiersByRewardsPool;
    mapping(address => CredmarkMembershipTier) public subscriptions;
    CredmarkMembershipToken public membershipToken;
    CredmarkMembershipTier[] public tiers;
    CredmarkMembershipRewardsPool[] public rewardsPools;
    CredmarkMembership public membership;

    address public treasury;

    constructor(address registryManager){
        _setupRole(REGISTRY_MANAGER, msg.sender);
        _setupRole(REGISTRY_MANAGER, registryManager);
    }

    // TIERS //

    function tierExists(CredmarkMembershipTier tier) internal view {
        bool _tierExists = false;

        for (uint i = 0; i< tiers.length; i++) {
            if (tiers[i] == tier) {
                _tierExists = true;
            }
        }
        return _tierExists;
    }

    function addTier(CredmarkMembershipTier tier) external onlyRole(REGISTRY_MANAGER) {
        tiers.push(tier);
    }

    function tierCount() external view {
        return tiers.length;
    }

    function removeTier(CredmarkMembershipTier tier) external onlyRole(REGISTRY_MANAGER) {
        for (uint i = 0; i<tiers.length; i++)
        {
            if (tiers[i] == tier){
                delete tiers[i];
                break;
            }
        }

        CredmarkMembershipTier[] memory rpTiers = tiersByRewardsPool[rewardsPools[tier]];

        for (uint i = 0; i<rpTiers.length; i++)
        {
            if (rpTiers[i] == tier){
                delete tiersByRewardsPool[rewardsPools[tier]][i];
                break;
            }
        }
    }

    // ORACLES //

    function addOracle(IERC20 token, IPriceOracle oracle) external onlyRole(REGISTRY_MANAGER) {
        require(!oracleExists(), "Oracle already exists.");
        oracles[token].push(oracle);
    }

    function oracleExists(IPriceOracle oracle) internal view {
        bool _oracleExists = false;

        for (uint i = 0; i< oracles.length; i++) {
            if (oracles[i] == oracle) {
                _oracleExists = true;
            }
        }
        return _oracleExists;
    }

    function removeOracle(IPriceOracle oracle) external onlyRole(REGISTRY_MANAGER) {
        for (uint i = 0; i<oracles.length; i++)
        {
            if (oracles[i] == oracle){
                delete oracles[i];
                break;
            }
        }
    }

    function oraclesLength(IERC20 token) external view {
        return oracles[token].length;
    }

    // REWARDS POOLS //

    function rewardsPoolExists(CredmarkMembershipRewardsPool rewardsPool) internal view {
        bool _rewardsPoolExists = false;

        for (uint i = 0; i< rewardsPools.length; i++) {
            if (rewardsPools[i] == rewardsPool) {
                _rewardsPoolExists = true;
            }
        }
        return _rewardsPoolExists;
    }

    function addRewardsPool(CredmarkMembershipRewardsPool rewardsPool) external onlyRole(REGISTRY_MANAGER) {
        require(!rewardsPoolExists(), "RewardsPool already exists.");
        rewardsPools.push(rewardsPool);
    }

    function rewardsPoolsLength() external view {
        return rewardsPools.length;
    }

    function setTierRewardsPool(CredmarkMembershipTier tier, CredmarkMembershipRewardsPool rewardsPool) external onlyRole(REGISTRY_MANAGER) {
        require(tierExists(tier), "Tier doesn't Exist.");
        require(rewardsPoolExists(rewardsPool),"RewardsPool doesn't Exist.");
        rewardsPoolByTier[tier] = rewardsPool;
        tiersByRewardsPool[rewardsPool].push(tier);
    }

    // TREASURY //

    function setTreasury(address _treasury) external onlyRole(REGISTRY_MANAGER) {
        treasury = _treasury;
    }

    // MEMBERSHIP //

    function setMembershipToken(CredmarkMembershipToken _membershipToken) external onlyRole(REGISTRY_MANAGER) {
        require(address(membershipToken) == address(0), "MembershipToken already exists");
        membershipToken = _membershipToken;
    }

    function subscribe(uint tokenId, CredmarkMembershipTier tier) external onlyRole(REGISTRY_MANAGER) {
        require(tierExists(tier), "Tier doesn't Exist.");
        subscriptions[tokenId] = tier;
    }

    function subscription(uint tokenId) external view returns (CredmarkMembershipTier) {
        return subscriptions[tokenId];
    }

    function rewardsTokenByTier(CredmarkMembershipTier tier) external view returns (IERC20) {
        return rewardsPoolByTier[tier].rewardsToken;
    }

    function tierCountForRewardsPool(CredmarkMembershipRewardsPool rewardsPool) external returns (uint) {
        return tiersByRewardsPool[rewardsPool].length;
    }
}