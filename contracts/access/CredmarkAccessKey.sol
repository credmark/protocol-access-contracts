// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "../interfaces/IPriceOracle.sol";
import "./CredmarkAccessKeySubscriptionTier.sol";

contract CredmarkAccessKey is ERC721, ERC721Enumerable, AccessControl {
    using Counters for Counters.Counter;

    bytes32 public constant DAO_MANAGER = keccak256("DAO_MANAGER");
    bytes32 public constant TIER_MANAGER = keccak256("TIER_MANAGER");

    IERC20 private cmk;
    address private credmarkDaoTreasury;

    Counters.Counter private _tokenIdCounter;

    CredmarkAccessKeySubscriptionTier[] public supportedTiers;
    mapping(address => bool) public supportedTierAddresses;

    mapping(uint256 => address) public tokenSubscription;
    mapping(uint256 => uint256) public tokenSubscriptionTimestamp;
    mapping(uint256 => uint256) public tokenDebtDiscount;

    mapping(uint256 => uint256) public cmkAmount;
    uint256 public totalCmkStaked;

    event SubscriptionTierCreated(address subscriptionTierAddress);
    event SubscriptionTierSubscribed(uint256 tokenId, address subscriptionTierAddress);
    event DebtResolved(uint256 tokenId, uint256 debt);
    event TokenFunded(uint256 tokenId, uint256 cmkAmount);
    event TokenLiquidated(uint256 tokenId, uint256 debt);

    constructor(address _cmk, address _credmarkDaoTreasury) ERC721("CredmarkAccessKey", "cmkkey") {
        cmk = IERC20(_cmk);
        credmarkDaoTreasury = _credmarkDaoTreasury;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(DAO_MANAGER, msg.sender);
        _grantRole(TIER_MANAGER, msg.sender);
    }

    function setDaoTreasury(address newCredmarkDaoTreasury) external onlyRole(DAO_MANAGER) {
        credmarkDaoTreasury = newCredmarkDaoTreasury;
    }

    function safeMint(address to) public returns (uint256 tokenId) {
        tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _safeMint(to, tokenId);
    }

    function fund(uint256 tokenId, uint256 amount) public {
        require(tokenSubscription[tokenId] != address(0), "Not subscribed");

        SafeERC20.safeTransferFrom(cmk, msg.sender, address(this), amount);
        cmk.approve(tokenSubscription[tokenId], amount);
        cmkAmount[tokenId] += amount;
        totalCmkStaked += amount;

        CredmarkAccessKeySubscriptionTier(tokenSubscription[tokenId]).stake(amount);

        emit TokenFunded(tokenId, amount);
    }

    function createSubscriptionTier(
        address tierManager,
        address priceOracle,
        uint256 monthlyFeeUsd,
        uint256 lockupPeriod,
        bool subscribable
    ) external onlyRole(TIER_MANAGER) returns (address tierAddress) {
        CredmarkAccessKeySubscriptionTier newTier = new CredmarkAccessKeySubscriptionTier(
            tierManager,
            priceOracle,
            monthlyFeeUsd,
            lockupPeriod,
            address(cmk)
        );

        if (subscribable) {
            newTier.setSubscribable(true);
        }

        tierAddress = address(newTier);

        supportedTiers.push(newTier);
        supportedTierAddresses[tierAddress] = true;

        emit SubscriptionTierCreated(tierAddress);
    }

    function totalSupportedTiers() external view returns (uint256) {
        return supportedTiers.length;
    }

    function burn(uint256 tokenId) external {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Approval required");
        require(
            tokenSubscription[tokenId] == address(0) ||
                tokenSubscriptionTimestamp[tokenId] == 0 ||
                block.timestamp - tokenSubscriptionTimestamp[tokenId] >=
                CredmarkAccessKeySubscriptionTier(tokenSubscription[tokenId]).lockupPeriodSeconds(),
            "Minimum lockup period"
        );

        uint256 _debt = debt(tokenId);
        uint256 _cmkAmount = (CredmarkAccessKeySubscriptionTier(tokenSubscription[tokenId]).withdrawalAmount(
            address(this)
        ) * cmkAmount[tokenId]) / totalCmkStaked;

        require(_debt <= _cmkAmount, "Access Key is not solvent");

        uint256 unstakedAmount = CredmarkAccessKeySubscriptionTier(tokenSubscription[tokenId]).unstake(
            cmkAmount[tokenId]
        );

        delete cmkAmount[tokenId];
        delete tokenDebtDiscount[tokenId];

        SafeERC20.safeTransfer(cmk, ownerOf(tokenId), unstakedAmount - _debt);
        SafeERC20.safeTransfer(cmk, credmarkDaoTreasury, cmk.balanceOf(address(this)));

        _burn(tokenId);

        emit DebtResolved(tokenId, _debt);
    }

    function subscribe(uint256 tokenId, address subscription) public {
        require(_isApprovedOrOwner(msg.sender, tokenId) || hasRole(TIER_MANAGER, msg.sender), "Approval required");
        require(supportedTierAddresses[subscription] == true, "Unsupported subscription");
        require(
            CredmarkAccessKeySubscriptionTier(subscription).subscribable() == true || hasRole(TIER_MANAGER, msg.sender),
            "Tier is not subscribable"
        );
        require(
            tokenSubscriptionTimestamp[tokenId] == 0 ||
                block.timestamp - tokenSubscriptionTimestamp[tokenId] >=
                CredmarkAccessKeySubscriptionTier(subscription).lockupPeriodSeconds(),
            "Minimum lockup period"
        );

        if (tokenSubscription[tokenId] != address(0x00)) {
            resolveDebt(tokenId);
        }

        tokenDebtDiscount[tokenId] = CredmarkAccessKeySubscriptionTier(subscription).getGlobalDebt();
        tokenSubscription[tokenId] = subscription;
        tokenSubscriptionTimestamp[tokenId] = block.timestamp;

        emit SubscriptionTierSubscribed(tokenId, subscription);
    }

    function mintSubscribeAndFund(uint256 amount, address subscription) external {
        uint256 tokenId = safeMint(_msgSender());
        subscribe(tokenId, subscription);
        fund(tokenId, amount);
    }

    function debt(uint256 tokenId) public view returns (uint256) {
        if (tokenSubscription[tokenId] == address(0)) {
            return 0;
        }

        return
            CredmarkAccessKeySubscriptionTier(tokenSubscription[tokenId]).getGlobalDebt() - tokenDebtDiscount[tokenId];
    }

    function resolveDebt(uint256 tokenId) public {
        uint256 _debt = debt(tokenId);
        tokenDebtDiscount[tokenId] += _debt;

        CredmarkAccessKeySubscriptionTier tier = CredmarkAccessKeySubscriptionTier(tokenSubscription[tokenId]);
        uint256 _cmkAmount = (tier.withdrawalAmount(address(this)) * cmkAmount[tokenId]) / totalCmkStaked;

        uint256 cmkToUnstake = (_debt * cmkAmount[tokenId]) / _cmkAmount;

        require(cmkAmount[tokenId] >= cmkToUnstake, "Insufficient fund");
        cmkAmount[tokenId] -= cmkToUnstake;

        tier.unstake(cmkToUnstake);
        SafeERC20.safeTransfer(cmk, credmarkDaoTreasury, cmk.balanceOf(address(this)));

        emit DebtResolved(tokenId, _debt);
    }

    function liquidate(uint256 tokenId) external {
        require(tokenSubscription[tokenId] != address(0), "Not subscribed");
        uint256 _debt = debt(tokenId);
        uint256 _cmkAmount = (CredmarkAccessKeySubscriptionTier(tokenSubscription[tokenId]).withdrawalAmount(
            address(this)
        ) * cmkAmount[tokenId]) / totalCmkStaked;

        require(_debt > _cmkAmount, "Access Key is solvent");

        uint256 unstakedAmount = CredmarkAccessKeySubscriptionTier(tokenSubscription[tokenId]).unstake(
            cmkAmount[tokenId]
        );

        tokenDebtDiscount[tokenId] += unstakedAmount;
        totalCmkStaked -= cmkAmount[tokenId];
        cmkAmount[tokenId] = 0;

        SafeERC20.safeTransfer(cmk, credmarkDaoTreasury, cmk.balanceOf(address(this)));

        emit TokenLiquidated(tokenId, _debt);
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
