// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "../CredmarkPriceOracleUsd.sol";
import "../interfaces/IStakedCredmark.sol";

contract CredmarkAccessKey is ERC721, ERC721Enumerable, AccessControl {
    using Counters for Counters.Counter;
    bytes32 public constant TIER_MANAGER = keccak256("TIER_MANAGER");

    IERC20 private constant CMK = IERC20(address(0x00));
    IStakedCredmark private constant XCMK = IStakedCredmark(address(0x00));
    address private constant CREDMARK_DAO_TREASURY = address(0x000);

    Counters.Counter private _tokenIdCounter;

    CredmarkAccessKeySubscriptionTier[] supportedTiers;

    mapping(uint256 => address) tokenSubscription;
    mapping(uint256 => uint256) tokenDebtDiscount;

    CredmarkPriceOracleUsd public credmarkPriceOracle;

    mapping(uint256 => uint256) xCmkAmount;

    constructor() ERC721("CredmarkAccessKey", "CMKkey") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(TIER_MANAGER, msg.sender);
    }

    function safeMint(address to) public returns (uint256) {
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _safeMint(to, tokenId);
    }

    function createSubscriptionTier(uint256 monthlyFee, bool locked) public onlyRole(TIER_MANAGER) {
        CredmarkAccessKeySubscriptionTier newTier = new CredmarkAccessKeySubscriptionTier();
        newTier.setMonthlyFeeUsd(monthlyFee);
        newTier.setPriceOracle(credmarkPriceOracle);
        if (!locked) {
            newTier.lockTier(false);
        }
        supportedTiers.push(newTier);
    }

    function liquidate(uint256 tokenId) external {
        require(debt(tokenId) > XCMK.sharesToCmk(xCmkAmount[tokenId]), "Access Key is Solvent");
        XCMK.removeShare(xCmkAmount[tokenId]);
        CMK.transfer(CREDMARK_DAO_TREASURY, CMK.balanceOf(address(this)));
    }

    function fund(uint256 tokenId, uint256 amount) public {
        CMK.transferFrom(msg.sender, address(this), amount);
        CMK.approve(address(XCMK), amount);
        xCmkAmount[tokenId] += XCMK.createShare(amount);
    }

    function subscribe(uint256 tokenId, address subscription) public {
        require(_isApprovedOrOwner(msg.sender, tokenId) || hasRole(TIER_MANAGER, msg.sender));
        require(
            CredmarkAccessKeySubscriptionTier(subscription).locked() == false || hasRole(TIER_MANAGER, msg.sender),
            "Tier is Locked"
        );

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
        uint256 xCmkAmountTransfered = XCMK.cmkToShares(_debt);
        XCMK.removeShare(xCmkAmountTransfered);
        CMK.transfer(CREDMARK_DAO_TREASURY, _debt);
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

    CredmarkPriceOracleUsd private oracle;

    constructor() {
        _setupRole(TIER_MANAGER, address(0x0));
        lastGlobalDebtTimestamp = block.timestamp;
    }

    function getGlobalDebt() public view returns (uint256) {
        return lastGlobalDebt + (debtPerSecond * (block.timestamp - lastGlobalDebtTimestamp));
    }

    function setMonthlyFeeUsd(uint256 _monthlyFeeUsd) external onlyRole(TIER_MANAGER) {
        monthlyFeeUsdWei = _monthlyFeeUsd;
        updateGlobalDebtPerSecond();
    }

    function setPriceOracle(CredmarkPriceOracleUsd _oracle) public onlyRole(TIER_MANAGER) {
        oracle = _oracle;
    }

    function updateGlobalDebtPerSecond() public {
        lastGlobalDebt = getGlobalDebt();
        debtPerSecond = monthlyFeeUsdWei / oracle.cmkPrice() / SECONDS_PER_MONTH;
        lastGlobalDebtTimestamp = block.timestamp;
    }

    function lockTier(bool _locked) external onlyRole(TIER_MANAGER) {
        locked = _locked;
    }
}
