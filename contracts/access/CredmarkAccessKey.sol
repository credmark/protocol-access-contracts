// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/IStakedCredmark.sol";
import "../interfaces/IPriceOracle.sol";

contract CredmarkAccessKey is ERC721, ERC721Enumerable, AccessControl {
    using Counters for Counters.Counter;

    bytes32 public constant TIER_MANAGER = keccak256("TIER_MANAGER");

    IERC20 private cmk;
    IStakedCredmark private xcmk;
    address private credmarkDaoTreasury;

    Counters.Counter private _tokenIdCounter;

    CredmarkAccessKeySubscriptionTier[] public supportedTiers;
    mapping(address => bool) public supportedTierAddresses;

    mapping(uint256 => address) public tokenSubscription;
    mapping(uint256 => uint256) public tokenDebtDiscount;

    mapping(uint256 => uint256) public xCmkAmount;

    event SubscriptionTierCreated(address subscriptionTierAddress);

    constructor(
        address _cmk,
        address _xcmk,
        address _credmarkDaoTreasury
    ) ERC721("CredmarkAccessKey", "cmkkey") {
        cmk = IERC20(_cmk);
        xcmk = IStakedCredmark(_xcmk);
        credmarkDaoTreasury = _credmarkDaoTreasury;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(TIER_MANAGER, msg.sender);
    }

    function safeMint(address to) public returns (uint256 tokenId) {
        tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _safeMint(to, tokenId);
    }

    function createSubscriptionTier(
        address oracle,
        uint256 monthlyFee,
        bool locked
    ) public onlyRole(TIER_MANAGER) returns (address tierAddress) {
        CredmarkAccessKeySubscriptionTier newTier = new CredmarkAccessKeySubscriptionTier();
        newTier.setPriceOracle(oracle);
        newTier.setMonthlyFeeUsd(monthlyFee);
        if (locked) {
            newTier.lockTier(true);
        }

        tierAddress = address(newTier);

        supportedTiers.push(newTier);
        supportedTierAddresses[tierAddress] = true;

        emit SubscriptionTierCreated(tierAddress);
    }

    function totalSupportedTiers() external view returns (uint256) {
        return supportedTiers.length;
    }

    function liquidate(uint256 tokenId) external {
        require(debt(tokenId) > xcmk.sharesToCmk(xCmkAmount[tokenId]), "Access Key is Solvent");
        // tokenDebtDiscount[tokenId] += debt(tokenId);
        // xCmkAmount[tokenId] = 0;

        xcmk.removeShare(xCmkAmount[tokenId]);
        cmk.transfer(credmarkDaoTreasury, cmk.balanceOf(address(this)));
    }

    function fund(uint256 tokenId, uint256 amount) public {
        cmk.transferFrom(msg.sender, address(this), amount);
        cmk.approve(address(xcmk), amount);
        xCmkAmount[tokenId] += xcmk.createShare(amount);
    }

    function burn(uint256 tokenId) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Approval required");

        uint256 _debt = debt(tokenId);
        uint256 cmkAmount = xcmk.sharesToCmk(xCmkAmount[tokenId]);

        require(_debt <= cmkAmount, "Access Key is not solvent");

        xcmk.removeShare(xCmkAmount[tokenId]);

        delete xCmkAmount[tokenId];
        delete tokenDebtDiscount[tokenId];

        cmk.transfer(credmarkDaoTreasury, _debt);
        cmk.transfer(ownerOf(tokenId), cmkAmount - _debt);

        _burn(tokenId);
    }

    function subscribe(uint256 tokenId, address subscription) public {
        require(_isApprovedOrOwner(msg.sender, tokenId) || hasRole(TIER_MANAGER, msg.sender), "Approval required");
        require(
            CredmarkAccessKeySubscriptionTier(subscription).locked() == false || hasRole(TIER_MANAGER, msg.sender),
            "Tier is Locked"
        );
        require(supportedTierAddresses[subscription] == true, "Unsupported subscription");

        if (tokenSubscription[tokenId] != address(0x00)) {
            resolveDebt(tokenId);
        }

        tokenDebtDiscount[tokenId] = CredmarkAccessKeySubscriptionTier(subscription).getGlobalDebt();
        tokenSubscription[tokenId] = subscription;
    }

    function mintFundAndSubscribe(uint256 amount, address subscription) public {
        uint256 tokenId = safeMint(_msgSender());
        fund(tokenId, amount);
        subscribe(tokenId, subscription);
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

        uint256 xCmkAmountTransfered = xcmk.cmkToShares(_debt);
        xCmkAmount[tokenId] -= xCmkAmountTransfered;

        xcmk.removeShare(xCmkAmountTransfered);
        cmk.transfer(credmarkDaoTreasury, _debt);
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

contract CredmarkAccessKeySubscriptionTier is AccessControl {
    bytes32 public constant TIER_MANAGER = keccak256("TIER_MANAGER");
    uint256 public constant SECONDS_PER_MONTH = 2592000;

    uint256 public monthlyFeeUsdWei;
    uint256 public debtPerSecond;
    uint256 public lastGlobalDebt;
    uint256 public lastGlobalDebtTimestamp;
    bool public locked;

    IPriceOracle private oracle;

    constructor() {
        _setupRole(TIER_MANAGER, msg.sender);
        _setupRole(TIER_MANAGER, address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266));
        lastGlobalDebtTimestamp = block.timestamp;
    }

    function getGlobalDebt() public view returns (uint256) {
        return lastGlobalDebt + (debtPerSecond * (block.timestamp - lastGlobalDebtTimestamp));
    }

    function setMonthlyFeeUsd(uint256 _monthlyFeeUsd) external onlyRole(TIER_MANAGER) {
        monthlyFeeUsdWei = _monthlyFeeUsd;
        updateGlobalDebtPerSecond();
    }

    function setPriceOracle(address _oracle) external onlyRole(TIER_MANAGER) {
        oracle = IPriceOracle(_oracle);
    }

    function updateGlobalDebtPerSecond() public {
        require(address(oracle) != address(0), "Oracle not set");

        lastGlobalDebt = getGlobalDebt();
        uint256 cmkPrice = oracle.getPrice();
        uint256 cmkPriceDecimals = oracle.decimals();
        require(cmkPrice != 0, "CMK price is reported 0");

        debtPerSecond = (monthlyFeeUsdWei * 10**cmkPriceDecimals) / (cmkPrice * SECONDS_PER_MONTH);
        lastGlobalDebtTimestamp = block.timestamp;
    }

    function lockTier(bool _locked) external onlyRole(TIER_MANAGER) {
        locked = _locked;
    }
}
