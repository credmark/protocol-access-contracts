// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IPriceOracle.sol";
import "./CredmarkMembershipToken.sol";
import "./CredmarkMembershipTier.sol";
import "./CredmarkMembershipRewardsPool.sol";
import "./CredmarkMembershipRegistry.sol";


contract CredmarkMembershipFactory is AccessControl {

    bytes32 public constant FACTORY_MANAGER = keccak256("FACTORY_MANAGER");

    CredmarkMembershipRegistry public registry;

    constructor(address factoryManager) {
        _setupRole(factoryManager, FACTORY_MANAGER);
        createRegistry();
    }
    
    // I don't think I set up membership anywhere... IDK

    function createMembershipToken() external onlyRole(FACTORY_MANAGER) {
        registry.setMembershipToken(new CredmarkMembershipToken());
    }

    function createRegistry() internal {
        registry = new CredmarkMembershipRegistry(msg.sender);
    }

    function createTier(CredmarkMembershipTier.MembershipTierConfiguration memory configuration, CredmarkMembershipRewardsPool rewardsPool) external onlyRole(FACTORY_MANAGER) {
        require(address(registry) != address(0), "No Registry Exists");
        registry.addTier(new CredmarkMembershipTier(configuration), rewardsPool);
    }

    function createRewardsPool(IERC20 rewardsToken) external onlyRole(FACTORY_MANAGER) {
        require(address(registry) != address(0), "No Registry Exists");
        registry.addRewardsPool(new CredmarkMembershipRewardsPool(rewardsToken, address(this), msg.sender));
    }
}