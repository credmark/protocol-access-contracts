// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@credmark/protocol-core-contracts/contracts/interfaces/IStakedCredmark.sol";

contract CredmarkModel is ERC721, ERC721Enumerable, AccessControl {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;

    IStakedCredmark public stakedCredmark;
    IERC20 public credmark;

    enum ValidationStatus {
        SUBMITTED,
        ACCEPTED,
        REJECTED,
        UNDER_INVESTIGATION,
        RETRACTED
    }

    struct ModelInfo {
        ValidationStatus validationStatus;
        uint256 modelHash;
    }

    event ModelMinted(uint256 tokenId, uint256 modelHash);
    event CredmarkAddedToModel(uint256 tokenId, uint256 amount);

    mapping(uint256 => ModelInfo) private _infos;
    mapping(uint256 => uint256) private _sharesLocked;
    mapping(uint256 => uint256) private _hashToId;

    uint256 public mintCollateral;

    constructor(IStakedCredmark _stakedCredmark, IERC20 _credmark) ERC721("CredmarkModel", "modelCMK") {
        stakedCredmark = _stakedCredmark;
        credmark = _credmark;
    }

    modifier collateralRemovable(uint256 tokenId) {
        require(
            _infos[tokenId].validationStatus == ValidationStatus.ACCEPTED ||
                _infos[tokenId].validationStatus == ValidationStatus.REJECTED ||
                _infos[tokenId].validationStatus == ValidationStatus.RETRACTED
        );
        _;
    }

    modifier tokenExists(uint256 tokenId) {
        require(_exists(tokenId), "No such token");
        _;
    }

    function mint(
        address to,
        uint256 cmkAmount,
        uint256 modelHash
    ) external returns (uint256 tokenId) {
        require(cmkAmount > mintCollateral, "Require More CMK to Mint Model");
        require(_hashToId[modelHash] == 0x0, "Non Unique Model Hash");

        tokenId = _tokenIdCounter.current();
        addCmk(tokenId, cmkAmount);

        _safeMint(to, tokenId);
        _hashToId[modelHash] = tokenId;
        _infos[tokenId] = ModelInfo(ValidationStatus.SUBMITTED, modelHash);

        _tokenIdCounter.increment();

        emit ModelMinted(tokenId, modelHash);
    }

    function addCmk(uint256 tokenId, uint256 cmkAmount) public tokenExists(tokenId) {
        credmark.transferFrom(msg.sender, address(this), cmkAmount);
        uint256 xCmk = stakedCredmark.createShare(cmkAmount);
        _sharesLocked[tokenId] += xCmk;

        emit CredmarkAddedToModel(tokenId, cmkAmount);
    }

    function removeCollateral(uint256 tokenId, uint256 cmkAmount)
        external
        tokenExists(tokenId)
        collateralRemovable(tokenId)
    {
        uint256 shares = stakedCredmark.cmkToShares(cmkAmount);
        require(shares >= _sharesLocked[tokenId]);
        stakedCredmark.removeShare(shares);

        //cmkAmount may be different than removed shares if calls rewards
        credmark.transfer(ownerOf(tokenId), cmkAmount);
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
