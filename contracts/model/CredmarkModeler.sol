// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./CredmarkModel.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CredmarkModeler is ERC721, Pausable, AccessControl {
    using Counters for Counters.Counter;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    Counters.Counter private _tokenIdCounter;

    CredmarkModel private _modelContract;

    ERC20 private _mintToken;
    uint256 private _mintCost;

    event NFTMinted(uint256 tokenId);
    event ModelContractSet(string contractName);
    event MintTokenSet(string tokenName);
    event MintCostSet(uint256 cost);

    constructor() ERC721("CredmarkModeler", "CMKmlr") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    function setModelContract(CredmarkModel modelContract) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _modelContract = modelContract;

        emit ModelContractSet(modelContract.name());
    }

    function setMintToken(ERC20 mintToken) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _mintToken = mintToken;

        emit MintTokenSet(mintToken.name());
    }

    function setMintCost(uint256 mintCost) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _mintCost = mintCost;

        emit MintCostSet(mintCost);
    }

    function _baseURI() internal pure override returns (string memory) {
        return "https://api.credmark.com/v1/meta/modelers/";
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function safeMint(address to) public onlyRole(MINTER_ROLE) {
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _mintToken.transferFrom(_msgSender(), address(this), _mintCost);
        _safeMint(to, tokenId);

        emit NFTMinted(tokenId);
    }

    function getSlugHash(string memory _slug) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(_slug)));
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    // The following functions are overrides required by Solidity.

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
