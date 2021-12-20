// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@credmark/protocol-core-contracts/contracts/interfaces/IStakedCredmark.sol";

import "./interfaces/ICredmarkAccessKey.sol";

contract CredmarkAccessKey is ICredmarkAccessKey, ERC721, ERC721Enumerable, Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;

    struct CredmarkAccessFee {
        uint256 fromTimestamp;
        uint256 feePerSecond;
    }

    event FeeChanged(uint256 feeAmount);
    event LiquidatorRewardChanged(uint256 liquidatorRewardBp);
    event StakedCmkSweepShareChanged(uint256 stakedCmkShareBp);
    event AccessKeyMinted(uint256 tokenId);
    event AccessKeyBurned(uint256 tokenId);
    event AccessKeyLiquidated(uint256 tokenId, address liquidator, uint256 reward);
    event CredmarkAddedToKey(uint256 tokenId, uint256 amount);
    event Sweeped(uint256 cmkToSCmk, uint256 cmkToDao);

    CredmarkAccessFee[] public fees;
    uint256 public liquidatorRewardBp;
    uint256 public stakedCmkSweepShareBp;

    IStakedCredmark public stakedCredmark;
    address public credmarkDAO;
    IERC20 public credmark;

    mapping(uint256 => uint256) private _mintedTimestamp;
    mapping(uint256 => uint256) private _sharesLocked;

    constructor(
        IStakedCredmark _stakedCredmark,
        IERC20 _credmark,
        address _credmarkDAO,
        uint256 _feePerSecond,
        uint256 _liquidatorRewardBp,
        uint256 _stakedCmkSweepShareBp
    ) ERC721("CredmarkAccessKey", "accessCMK") {
        stakedCredmark = _stakedCredmark;
        credmark = _credmark;
        credmarkDAO = _credmarkDAO;

        fees.push(CredmarkAccessFee(block.timestamp, _feePerSecond));
        liquidatorRewardBp = _liquidatorRewardBp;
        stakedCmkSweepShareBp = _stakedCmkSweepShareBp;
    }

    modifier isLiquidateable(uint256 tokenId) {
        require(feesAccumulated(tokenId) >= cmkValue(tokenId), "Not liquidiateable");
        _;
    }

    // Configuration Functions
    function setFee(uint256 feePerSecond) external override onlyOwner {
        fees.push(CredmarkAccessFee(block.timestamp, feePerSecond));
        emit FeeChanged(feePerSecond);
    }

    function getFeesCount() external view override returns (uint256) {
        return fees.length;
    }

    function setLiquidatorReward(uint256 _liquidatorRewardBp) external override onlyOwner {
        require(_liquidatorRewardBp <= 10000, "Basis Point not in 0-10000 range");
        liquidatorRewardBp = _liquidatorRewardBp;
        emit LiquidatorRewardChanged(_liquidatorRewardBp);
    }

    function setStakedCmkSweepShare(uint256 _stakedCmkSweepShareBp) external override onlyOwner {
        require(_stakedCmkSweepShareBp <= 10000, "Basis Point not in 0-10000 range");
        stakedCmkSweepShareBp = _stakedCmkSweepShareBp;
        emit StakedCmkSweepShareChanged(stakedCmkSweepShareBp);
    }

    function feesAccumulated(uint256 tokenId) public view override returns (uint256 aggFees) {
        uint256 mintedTimestamp = _mintedTimestamp[tokenId];

        for (uint256 i = fees.length; i > 0; i--) {
            CredmarkAccessFee storage fee = fees[i - 1];
            uint256 fromTimestamp = max(mintedTimestamp, fee.fromTimestamp);
            uint256 toTimestamp = block.timestamp;
            if (i < fees.length) {
                toTimestamp = fees[i].fromTimestamp;
            }

            aggFees += fee.feePerSecond * (toTimestamp - fromTimestamp);

            if (fee.fromTimestamp <= mintedTimestamp) {
                break;
            }
        }
    }

    function cmkValue(uint256 tokenId) public view override returns (uint256) {
        return stakedCredmark.sharesToCmk(_sharesLocked[tokenId]);
    }

    // User Functions
    function mint(uint256 cmkAmount) external override returns (uint256 tokenId) {
        tokenId = _tokenIdCounter.current();
        _mintedTimestamp[tokenId] = block.timestamp;
        _safeMint(msg.sender, tokenId);
        addCmk(tokenId, cmkAmount);
        _tokenIdCounter.increment();

        emit AccessKeyMinted(tokenId);
    }

    function addCmk(uint256 tokenId, uint256 cmkAmount) public override {
        require(_exists(tokenId), "No such token");
        credmark.approve(address(stakedCredmark), cmkAmount);
        credmark.transferFrom(msg.sender, address(this), cmkAmount);
        uint256 xCmk = stakedCredmark.createShare(cmkAmount);
        _sharesLocked[tokenId] += xCmk;

        emit CredmarkAddedToKey(tokenId, cmkAmount);
    }

    function burn(uint256 tokenId) external override {
        require(msg.sender == ownerOf(tokenId), "Only owner can burn their NFT");
        burnInternal(tokenId);
    }

    function liquidate(uint256 tokenId) external override isLiquidateable(tokenId) {
        uint256 _cmkValue = cmkValue(tokenId);
        burnInternal(tokenId);

        uint256 liquidatorReward = (_cmkValue * liquidatorRewardBp) / 10000;
        if (liquidatorReward > 0) {
            credmark.transfer(msg.sender, liquidatorReward);
        }
        emit AccessKeyLiquidated(tokenId, msg.sender, liquidatorReward);
    }

    function sweep() external override {
        uint256 cmkToSCmk = (credmark.balanceOf(address(this)) * stakedCmkSweepShareBp) / 10000;
        if (cmkToSCmk > 0) {
            credmark.transfer(address(stakedCredmark), cmkToSCmk);
        }

        uint256 cmkToDao = credmark.balanceOf(address(this));
        if (cmkToDao > 0) {
            credmark.transfer(credmarkDAO, cmkToDao);
        }

        emit Sweeped(cmkToSCmk, cmkToDao);
    }

    function burnInternal(uint256 tokenId) internal {
        uint256 fee = feesAccumulated(tokenId);

        if (feesAccumulated(tokenId) > cmkValue(tokenId)) {
            fee = cmkValue(tokenId);
        }

        stakedCredmark.removeShare(_sharesLocked[tokenId]);
        uint256 returned = cmkValue(tokenId) - fee;
        if (returned > 0) {
            credmark.transfer(ownerOf(tokenId), returned);
        }

        _sharesLocked[tokenId] = 0;
        _burn(tokenId);

        emit AccessKeyBurned(tokenId);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a > b) {
            return a;
        }
        return b;
    }
}
