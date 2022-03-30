// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IPriceOracle.sol";
import "./CredmarkMembershipToken.sol";
import "./CredmarkMembershipTier.sol";
import "./CredmarkMembershipRegistry.sol";


contract CredmarkMembership is AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN = keccak256("ADMIN");

    CredmarkMembershipRegistry private registry;

    constructor(CredmarkMembershipRegistry _registry) {
        registry = _registry;
    }

    function mint(address recipient, uint amount, CredmarkMembershipTier tier) external returns (uint) {

        require(registry.tierExists(), "Unsupported Tier");
        require(address(registry.membershipToken()) != address(0), "MembershipToken not initialized");
        require(hasRole(ADMIN) || tier.subscribable(), "Tier not Subscribeable");

        uint tokenId = registry.membershipToken().safeMint(recipient);
        deposit(tokenId, amount);
        registry.subscribe(tokenId);
    }

    function deposit(uint tokenId, uint amount) public {
        CredmarkMembershipTier tier = registry.subscription(tokenId);

        require(address(tier)!= address(0), "Token Not Subscribed");

        SafeERC20.safeTransferFrom(tier.baseToken(), msg.sender, address(tier), amount);
        tier.deposit(tokenId, amount);
    }

    function exit(uint tokenId) public {
        require(isSolvent(), "Token is not Solvent");
        address owner = registry.membershipToken.ownerOf(tokenId);
        require(owner == msg.sender, "Must be owner of token to exit");

        CredmarkMembershipTier tier = registry.subscription(tokenId);

        (uint256 exitDeposits, uint256 exitRewards, uint256 exitFees) = tier.exit(tokenId);

        if (exitDeposits + exitRewards > exitFees) {
            registry.membershipToken.burn(tokenId);
            SafeERC20.safeTransferFrom(tier.baseToken(), address(tier), owner, exitDeposits + exitRewards - exitFees);
        }
    }

    function liquidate(uint tokenId) public {
        require(!isSolvent(tokenId), "Token is Solvent");

        CredmarkMembershipTier tier = registry.subscription(tokenId);

        (uint256 exitDeposits, uint256 exitRewards,) = tier.exit(tokenId);

        SafeERC20.safeTransferFrom(tier.baseToken(), address(tier), registry.treasury, exitDeposits);
        SafeERC20.safeTransferFrom(registry.rewardsTokenByTier(tier), address(registry.rewardsPoolByTier[tier]), registry.treasury, exitRewards);
        
        registry.membershipToken.burn(tokenId); 
    }

    function claim(uint tokenId, uint amount) public {
        require(isSolvent(tokenId), "Token is not solvent");

        address owner = registry.membershipToken.ownerOf(tokenId);
        require(owner == msg.sender ||  hasRole(ADMIN), "Not approved to claim this token");

        uint rewards = tier.rewards(tokenId);
        require(rewards >= amount, "Amount is higher than rewards");

        uint deposits = tier.deposits(tokenId);
        uint balanceAfterClaim = deposits + tier.rewardsToBaseValue(tier.rewards(tokenId) - amount);
        uint fees = tier.fees(tokenId);

        if (fees < balanceAfterClaim) {
            SafeERC20.safeTransferFrom(registry.rewardsTokenByTier(tier), registry.rewardsPoolByTier[tier], owner, amount);
            tier.claim(tokenId, amount);
        }
    }

    function isSolvent(uint tokenId) public view {
        CredmarkMembershipTier tier = registry.subscription(tokenId);

        uint deposits = tier.deposits(tokenId);
        uint rewards = tier.rewards(tokenId);
        uint fees = tier.fees(tokenId);
        if (tier.baseToken() != registry.rewardsTokenByTier(tier)){
            IPriceOracle baseOracle = registry.oracles[tier.baseToken()];
            IPriceOracle rewardsOracle = registry.oracles[registry.rewardsTokenByTier(tier)];
            rewards = rewards * rewardsOracle.getPrice() * (10**baseOracle.decimals()) / (baseOracle.getPrice() * (10**rewardsOracle.decimals()));
        }
        return deposits + rewards >= fees; 
    }
}
