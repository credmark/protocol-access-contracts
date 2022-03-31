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
    IERC20 internal cmk;

    constructor(CredmarkMembershipRegistry _registry, IERC20 _cmk) 
        ERC721(
            "CredmarkMembershipToken", 
            "cmkMembership") 
    {
        registry = _registry;
        cmk = _cmk;
        grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

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

        require(registry.contractExists(address(tier)), "Unsupported Tier");
        require(hasRole(ADMIN) || tier.subscribable(), "Tier not Subscribeable");

        _safeMint(to, tokenId);
        registry.subscribe(tokenId);
        deposit(tokenId, amount);
    }

    function deposit(uint tokenId, uint amount) public {
        CredmarkMembershipTier tier = registry.subscription(tokenId);

        require(address(tier)!= address(0), "Token Not subscribed to a tier");

        SafeERC20.safeTransferFrom(tier.baseToken(), msg.sender, address(tier), amount);
        tier.deposit(tokenId, amount);

        registry.oracle.oracles(cmk).sample();
    }

    function burn(uint tokenId) public {
        require(isSolvent(), "Token is not Solvent");
        require(_isApprovedOrOwner(msg.sender, tokenId), "ERROR: Not the owner");

        address owner = ownerOf(tokenId);
        CredmarkMembershipTier tier = registry.subscription(tokenId);

        (uint256 exitDeposits, uint256 exitRewards, uint256 exitFees, uint256 exitRewardsBaseValue) = tier.exit(tokenId);

        if (exitDeposits > exitFees) {
            SafeERC20.safeTransferFrom(tier.baseToken(), address(tier), owner, exitDeposits - exitFees);
            SafeERC20.safeTransferFrom(tier.baseToken(), address(tier), registry.treasury, exitFees);
            claim(tokenId, exitRewards);
        }
        if (exitDeposits + exitRewardsBaseValue > exitFees) {
            // figure out this math
            SafeERC20.safeTransferFrom(tier.baseToken(), address(tier), owner, exitDeposits + exitRewardsBaseValue - exitFees);
        }
        _burn(tokenId);
    }

    function liquidate(uint tokenId) public {
        require(!isSolvent(tokenId), "Token is Solvent");

        CredmarkMembershipTier tier = registry.subscription(tokenId);

        (uint256 exitDeposits, uint256 exitRewards,) = tier.exit(tokenId);

        SafeERC20.safeTransferFrom(tier.baseToken(), address(tier), registry.treasury, exitDeposits);
        SafeERC20.safeTransferFrom(registry.rewardsTokenByTier(tier), address(registry.rewardsPoolByTier[tier]), registry.treasury, exitRewards);
        _burn(tokenId);
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
        /// I'm confused
        if (fees < balanceAfterClaim) {
            SafeERC20.safeTransferFrom(registry.rewardsTokenByTier(tier), registry.rewardsPoolByTier[tier], owner, amount);
            tier.claim(tokenId, amount);
        }
    }

    function isSolvent(uint tokenId) public view {
        CredmarkMembershipTier tier = registry.subscription(tokenId);

        uint deposits = tier.deposits(tokenId);
        uint rewardsBaseValue = tier.rewardsValue(tokenId);
        uint fees = tier.fees(tokenId);

        return deposits + rewardsBaseValue >= fees; 
    }
}