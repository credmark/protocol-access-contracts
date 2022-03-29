// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "../interfaces/IPriceOracle.sol";
import "./ICredmarkMembership.sol";
import "./CredmarkMembershipTier.sol";
import "./ICredmarkMembershipToken.sol";

contract CredmarkMembershipToken is ERC721, ERC721Enumerable, AccessControl {
    using Counters for Counters.Counter;
    using SafeERC20 for IERC20;

    bytes32 public constant DAO_MANAGER = keccak256("DAO_MANAGER");
    bytes32 public constant TIER_MANAGER = keccak256("TIER_MANAGER");

    Counters.Counter private _tokenIdCounter;

    mapping(uint256 => CredmarkMembershipTier) public tiers;
    mapping(uint256 => uint256) private subscribedAt;

    ICredmarkMembership private membership;

    event SubscriptionTierSubscribed(uint256 tokenId, address subscriptionTierAddress);
    event FeeResolved(uint256 tokenId, uint256 fee);
    event TokenFunded(uint256 tokenId, uint256 amount);
    event TokenLiquidated(uint256 tokenId);

    modifier unlocked(uint256 tokenId) {
        (,uint lockup,,,,,,) = tiers[tokenId].config();
        require(
            address(tiers[tokenId]) == address(0) ||
            block.timestamp - subscribedAt[tokenId] >= lockup, "Lockup still in effect.");
        _;
    }

    modifier solvent(uint256 tokenId) {
        require(
            tiers[tokenId].fees(tokenId) <= tiers[tokenId].rewards(tokenId) + tiers[tokenId].deposits(tokenId),
            "Membership is insolvent"
        );
        _;
    }

    modifier insolvent(uint256 tokenId) {
        require(
            tiers[tokenId].fees(tokenId) > tiers[tokenId].rewards(tokenId) + tiers[tokenId].deposits(tokenId),
            "Membership is solvent"
        );
        _;
    }

    constructor() ERC721("Credmark Membership Token", "cmkMEMBER") {
        membership = ICredmarkMembership(msg.sender);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(DAO_MANAGER, msg.sender);
        _grantRole(TIER_MANAGER, msg.sender);
    }

    function safeMint(address to) public returns (uint256 tokenId) {
        tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _safeMint(to, tokenId);
    }

    function burn(uint256 tokenId) external  unlocked(tokenId) {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Approval required");
        burnInternal(tokenId);
    }

    function burnInternal(uint256 tokenId) internal {
        CredmarkMembershipTier tier = tiers[tokenId];
        (,,,,,,IERC20 baseToken,) = tier.config();
        uint256 feeAmount = tier.fees(tokenId);
        uint256 grossAmount = tier.deposits(tokenId) + tier.rewards(tokenId);

        if (feeAmount < grossAmount) {
            baseToken.safeTransfer(ownerOf(tokenId), grossAmount - feeAmount);
            baseToken.safeTransfer(membership.treasury(), feeAmount);
        } else {
            baseToken.safeTransfer(membership.treasury(), grossAmount);
        }
        
        tier.exit(tokenId);
        _burn(tokenId);

        emit FeeResolved(tokenId, feeAmount);
    }

    function fund(uint256 tokenId, uint256 amount) public {
        require(address(tiers[tokenId]) != address(0), "Not subscribed to any tiers");
        ICredmarkMembershipTier tier = tiers[tokenId];
        (,,,,,,IERC20 baseToken,) = tiers[tokenId].config();
        baseToken.safeTransferFrom(msg.sender, address(this), amount);
        tiers[tokenId].deposit(tokenId, amount);

        emit TokenFunded(tokenId, amount);
    }

    function subscribe(uint256 tokenId, CredmarkMembershipTier tier) public unlocked(tokenId) solvent(tokenId){
        require(_isApprovedOrOwner(msg.sender, tokenId) || hasRole(TIER_MANAGER, msg.sender), "Approval required");

        uint exitDeposits;
        uint exitFees;
        uint exitRewards;

        if (address(tiers[tokenId]) != address(0)) {
            (,,,,,,IERC20 baseToken,) = tiers[tokenId].config();
            (,,,,,,IERC20 newBaseToken,) = tier.config();

            require(baseToken == newBaseToken, "Cannot switch between subscriptions with different base tokens");

            (exitDeposits, exitRewards, exitFees) = tiers[tokenId].exit(tokenId);
            baseToken.safeTransfer(membership.treasury(), exitFees);
        }

        tiers[tokenId] = tier;

        emit SubscriptionTierSubscribed(tokenId, address(tier));

        if (exitDeposits > 0) {
            tier.deposit(tokenId, exitDeposits + exitRewards - exitFees);
        }
    }

    function mintSubscribeAndFund(uint256 amount, address subscription) external {
        uint256 tokenId = safeMint(_msgSender());
        subscribe(tokenId, CredmarkMembershipTier(subscription));
        fund(tokenId, amount);
    }

    function liquidate(uint256 tokenId) external insolvent(tokenId) {
        burnInternal(tokenId);
        emit TokenLiquidated(tokenId);
    }

    function fees(uint256 tokenId) view public returns (uint256) {
        return tiers[tokenId].fees(tokenId);
    }

    function rewards(uint256 tokenId) view public returns (uint256) {
        return tiers[tokenId].rewards(tokenId);
    }

    function deposits(uint256 tokenId) view public returns (uint256) {
        return tiers[tokenId].deposits(tokenId);
    }

    function shares(uint256 tokenId) view public returns (uint256) {
        (uint256 multiplier,,,,,,,) = tiers[tokenId].config();
        return tiers[tokenId].deposits(tokenId) * multiplier;
    }

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
        override(ERC721, ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
