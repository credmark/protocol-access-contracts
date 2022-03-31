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
import "../oracle/TokenOracles.sol";

contract CredmarkMembershipRegistry is AccessControl {

    bytes32 public constant REGISTRY_MANAGER = keccak256("REGISTRY_MANAGER");

    TokenOracles public oracle;
    CredmarkMembershipToken public membershipToken;
    CredmarkMembershipTier[] public tiers;
    CredmarkMembershipRewardsPool[] public rewardsPools;
    mapping(address => bool) public contractExists;

    address public treasury;

    mapping(uint => CredmarkMembershipTier) public subscriptions;

    mapping(CredmarkMembershipTier => CredmarkMembershipRewardsPool) public rewardsPoolByTier;
    mapping(CredmarkMembershipRewardsPool => CredmarkMembershipTier[]) public tiersByRewardsPool;

    constructor(address registryManager){
        grantRole(REGISTRY_MANAGER, msg.sender);
        grantRole(REGISTRY_MANAGER, registryManager);
    }

    // TIERS //

    function tierExists(CredmarkMembershipTier tier) internal view {
        return contractExists[address(tier)];
    }

    function addTier(CredmarkMembershipTier tier) external onlyRole(REGISTRY_MANAGER) {
        tiers.push(tier);
        contractExists[address(tier)] = true;
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
        delete contractExists[address(tier)];
    }

    // ORACLES //

    function addOracle(TokenOracles _tokenOracle) 
        external 
        onlyRole(REGISTRY_MANAGER) 
    {
        oracle = _tokenOracle;
    }

    // REWARDS POOLS //

    function addRewardsPool(CredmarkMembershipRewardsPool rewardsPool) external onlyRole(REGISTRY_MANAGER) {
        require(!contractExists[address(rewardsPool)], "RewardsPool already exists.");
        rewardsPools.push(rewardsPool);
        contractExists[address(rewardsPool)] = true;
    }

    function rewardsPoolsLength() external view {
        return rewardsPools.length;
    }

    function setTierRewardsPool(CredmarkMembershipTier tier, CredmarkMembershipRewardsPool rewardsPool) external onlyRole(REGISTRY_MANAGER) {
        require(contractExists[address(tier)], "Tier doesn't Exist.");
        require(contractExists[address(rewardsPool)],"RewardsPool doesn't Exist.");
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
        require(contractExists[address(tier)], "Tier doesn't Exist.");
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