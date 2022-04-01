// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./CredmarkMembershipToken.sol";
import "./CredmarkMembershipTier.sol";
import "./CredmarkMembershipRegistry.sol";
import "../oracle/TokenOracles.sol";

contract CredmarkMembershipToken is ERC721, ERC721Enumerable {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;
    CredmarkMembershipRegistry registry;

    constructor(CredmarkMembershipRegistry _registry)
        ERC721("CredmarkMembershipToken", "cmkMembership")
    {
        registry = _registry;
    }

    function safeMint(address to) internal returns (uint256 tokenId) {
        tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _safeMint(to, tokenId);
    }

    // The following functions are overrides required by Solidity.

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function mint(
        address to,
        uint256 amount,
        CredmarkMembershipTier tier
    ) external returns (uint256 tokenId) {
        require(registry.exists(address(tier)), "Unsupported Tier");

        // Getting a different contract's role may be a bad idea, probably want a subscribe despite check on the interface
        require(
            tier.hasRole(tier.TIER_MANAGER_ROLE(), msg.sender) || tier.isSubscribable(),
            "Tier not Subscribeable"
        );

        tokenId = safeMint(to);
        registry.subscribe(tokenId, tier);
        deposit(tokenId, amount);
    }

    function deposit(uint256 tokenId, uint256 amount) public {
        CredmarkMembershipTier tier = registry.subscription(tokenId);

        require(address(tier) != address(0), "Token Not subscribed to a tier");

        SafeERC20.safeTransferFrom(
            tier.baseToken(),
            msg.sender,
            address(tier),
            amount
        );
        tier.deposit(tokenId, amount);
    }

    function burn(uint256 tokenId) public {
        require(isSolvent(tokenId), "Token is not Solvent");
        require(
            _isApprovedOrOwner(msg.sender, tokenId),
            "ERROR: Not the owner"
        );

        address owner = ownerOf(tokenId);
        CredmarkMembershipTier tier = registry.subscription(tokenId);

        (
            uint256 exitDeposits,
            uint256 exitRewards,
            uint256 exitFees,
            uint256 exitRewardsBaseValue
        ) = tier.exit(tokenId);

        if (exitDeposits > exitFees) {
            SafeERC20.safeTransferFrom(
                tier.baseToken(),
                address(tier),
                owner,
                exitDeposits - exitFees
            );
            SafeERC20.safeTransferFrom(
                tier.baseToken(),
                address(tier),
                registry.treasury(),
                exitFees
            );
            claim(tokenId, exitRewards);
        }
        if (exitDeposits + exitRewardsBaseValue > exitFees) {
            // figure out this math
            SafeERC20.safeTransferFrom(
                tier.baseToken(),
                address(tier),
                owner,
                exitDeposits + exitRewardsBaseValue - exitFees
            );
        }
        _burn(tokenId);
    }

    function liquidate(uint256 tokenId) public {
        require(!isSolvent(tokenId), "Token is Solvent");

        CredmarkMembershipTier tier = registry.subscription(tokenId);

        (uint256 exitDeposits, uint256 exitRewards, , ) = tier.exit(tokenId);

        SafeERC20.safeTransferFrom(
            tier.baseToken(),
            address(tier),
            registry.treasury(),
            exitDeposits
        );
        SafeERC20.safeTransferFrom(
            registry.rewardsTokenByTier(tier),
            address(registry.rewardsPoolByTier(tier)),
            registry.treasury(),
            exitRewards
        );
        _burn(tokenId);
    }

    function claim(uint256 tokenId, uint256 amount) public {
        require(isSolvent(tokenId), "Token is not solvent");

        address owner = ownerOf(tokenId);
        CredmarkMembershipTier tier = registry.subscription(tokenId);
        require(
            owner == msg.sender || tier.hasRole(tier.TIER_MANAGER_ROLE(), msg.sender),
            "Not approved to claim this token"
        );

        uint256 rewards = tier.rewards(tokenId);
        require(rewards >= amount, "Amount is higher than rewards");

        uint256 deposits = tier.deposits(tokenId);

        // MATH IS WRONG
        uint256 balanceAfterClaim = deposits + tier.rewards(tokenId) - amount;
        uint256 fees = tier.fees(tokenId);
        /// I'm confused
        if (fees < balanceAfterClaim) {
            SafeERC20.safeTransferFrom(
                registry.rewardsTokenByTier(tier),
                address(registry.rewardsPoolByTier(tier)),
                owner,
                amount
            );
            tier.claim(tokenId, amount);
        }
    }

    function isSolvent(uint256 tokenId) public returns (bool) {
        CredmarkMembershipTier tier = registry.subscription(tokenId);

        uint256 deposits = tier.deposits(tokenId);
        uint256 rewardsBaseValue = tier.rewardsValue(tokenId);
        uint256 fees = tier.fees(tokenId);

        return deposits + rewardsBaseValue >= fees;
    }
}
