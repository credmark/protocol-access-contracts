// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@credmark/protocol-core-contracts/contracts/StakedCredmark.sol";

contract StakedCredmarkNFT is ERC721, ERC721Enumerable, AccessControl {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;

    StakedCredmark public stakedCredmark;
    IERC20 public credmark;

    uint256 public nftTotalValue;
    mapping(uint256 => uint256) private nftValue;

    uint256 public mintFeeCmk;
    address public feeCollector;
    uint256 public maximumValueCmk;
    bool public canAdd;
    bool public canRemove;

    constructor(StakedCredmark _stakedCredmark, IERC20 _credmark) ERC721("StakedCredmarkNFT", "xCMKnft") {
        stakedCredmark = _stakedCredmark;
        credmark = _credmark;
        credmark.approve(address(stakedCredmark), 1000000000000000000000000);
    }

    function mint(uint256 _cmkAmount) public returns (uint256 id) {
        require(_cmkAmount >= mintFeeCmk, "Mint Fee Not Exceeded");
        id = _tokenIdCounter.current();
        add(id, _cmkAmount);
        if (mintFeeCmk > 0) {
            credmark.transfer(feeCollector, mintFeeCmk);
        }
        _safeMint(msg.sender, id);
        _tokenIdCounter.increment();
    }

    function burn(uint256 id) public {
        remove(id, xCmkValueOf(id));
        _burn(id);
    }

    function add(uint256 _id, uint256 _cmkAmount) public {
        credmark.transferFrom(msg.sender, address(this), _cmkAmount);
        uint256 nftTotalXCmkBalance = stakedCredmark.balanceOf(address(this));
        uint256 xCMKcreated = stakedCredmark.createShare(_cmkAmount - mintFeeCmk);

        if (nftTotalXCmkBalance == 0) {
            nftValue[_id] = xCMKcreated;
        } else {
            nftValue[_id] = (xCMKcreated * nftTotalValue) / nftTotalXCmkBalance;
        }

        nftTotalValue += xCMKcreated;
    }

    function remove(uint256 _id, uint256 _xCmkAmount) public {
        uint256 xCmkValue = xCmkValueOf(_id);
        require(_xCmkAmount <= xCmkValue, "Not Enough xCMK in NFT");
        stakedCredmark.transfer(msg.sender, xCmkValue);
        uint256 oldNftValue = nftValue[_id];
        nftValue[_id] = (oldNftValue * (xCmkValue - _xCmkAmount)) / xCmkValue;
        nftTotalValue = nftTotalValue - oldNftValue + nftValue[_id];
    }

    function xCmkValueOf(uint256 _id) public view returns (uint256 xCmkValue) {
        xCmkValue = (nftValue[_id] * stakedCredmark.balanceOf(address(this))) / nftTotalValue;
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
