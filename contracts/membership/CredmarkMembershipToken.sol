// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "../interfaces/IPriceOracle.sol";
import "./CredmarkMembershipToken.sol";
import "./CredmarkMembershipTier.sol";
import "./CredmarkMembershipRegistry.sol";

contract CredmarkMembershipToken is ERC721, ERC721Enumerable, AccessControl {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;
    CredmarkMembershipRegistry registry;

    constructor(CredmarkMembershipRegistry _registry) 
        ERC721(
            "CredmarkMembershipToken", 
            "cmkMembership") 
    {
        registry = _registry;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

    }

    function safeMint(address to) internal {
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _safeMint(to, tokenId);
    }

    // The following functions are overrides required by Solidity.

    function _beforeTokenTransfer(address from, address to, uint256 tokenId)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function mint(address to, uint amount, CredmarkMembershipTier tier) external returns (uint) {

        require(registry.tierExists(), "Unsupported Tier");
        require(hasRole(ADMIN) || tier.subscribable(), "Tier not Subscribeable");

        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _safeMint(to, tokenId);

        deposit(tokenId, amount);
        registry.subscribe(tokenId);
    }

    function deposit(uint tokenId, uint amount) public {
        CredmarkMembershipTier tier = registry.subscription(tokenId);

        require(address(tier)!= address(0), "Token Not subscribed to a tier");

        SafeERC20.safeTransferFrom(tier.baseToken(), msg.sender, address(tier), amount);
        tier.deposit(tokenId, amount);

        registry.oracle.sample();
    }

    function burn(uint tokenId) public {
        require(isSolvent(), "Token is not Solvent");
        require(_isApprovedOrOwner(msg.sender, tokenId), "ERROR: Not the owner");

        address owner = ownerOf(tokenId);
        CredmarkMembershipTier tier = registry.subscription(tokenId);

        (uint256 exitDeposits, uint256 exitRewards, uint256 exitFees) = tier.exit(tokenId);

        if (exitDeposits > exitFees) {
            SafeERC20.safeTransferFrom(tier.baseToken(), address(tier), owner, exitDeposits - exitFees);
            SafeERC20.safeTransferFrom(tier.baseToken(), address(tier), registry.treasury, exitFees);
            claim(tokenId, exitRewards);
        }
        if (exitDeposits + exitRewards > exitFees) {
            _burn(tokenId);
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