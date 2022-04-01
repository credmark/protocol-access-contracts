import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber } from 'ethers';
import * as utils from 'ethers/lib/utils';
import { ethers, waffle } from 'hardhat';
import { MerkleTree } from 'merkletreejs';
import { CredmarkRewards, MockCMK, MockNFT } from '../typechain';
import { expect } from 'chai';

describe('Credmark Rewards', () => {
  let cmk: MockCMK;
  let nft: MockNFT;
  let credmarkRewards: CredmarkRewards;

  let wallet: SignerWithAddress;
  let otherWallet: SignerWithAddress;
  let admin: SignerWithAddress;

  let merkleTree: MerkleTree;

  const leaves = [
    {
      tokenId: BigNumber.from(0),
      amount: BigNumber.from(1),
    },
    {
      tokenId: BigNumber.from(1),
      amount: BigNumber.from(100),
    },
    {
      tokenId: BigNumber.from(2),
      amount: BigNumber.from(3).mul(BigNumber.from(10).pow(18)),
    },
    {
      tokenId: BigNumber.from(3),
      amount: BigNumber.from(4).mul(BigNumber.from(10).pow(18)),
    },
    {
      tokenId: BigNumber.from(4),
      amount: BigNumber.from(5).mul(BigNumber.from(10).pow(18)),
    },
    {
      tokenId: BigNumber.from(5),
      amount: BigNumber.from(50).mul(1e6).mul(BigNumber.from(10).pow(18)),
    },
  ];

  const encodeLeaf = (leaf: { tokenId: BigNumber; amount: BigNumber }) =>
    utils.keccak256(
      utils.defaultAbiCoder.encode(
        ['uint256', 'uint256'],
        [leaf.tokenId, leaf.amount]
      )
    );

  const fixture = async (): Promise<[MockCMK, MockNFT, CredmarkRewards]> => {
    const mockCmkFactory = await ethers.getContractFactory('MockCMK');
    const _cmk = (await mockCmkFactory.connect(admin).deploy()) as MockCMK;

    const mockNftFactory = await ethers.getContractFactory('MockNFT');
    const _nft = (await mockNftFactory.connect(admin).deploy()) as MockNFT;

    const credmarkRewardsFactory = await ethers.getContractFactory(
      'CredmarkRewards'
    );
    const _credmarkRewards = (await credmarkRewardsFactory
      .connect(admin)
      .deploy(admin.address, _cmk.address, _nft.address)) as CredmarkRewards;

    return [
      _cmk.connect(wallet),
      _nft.connect(wallet),
      _credmarkRewards.connect(wallet),
    ];
  };

  beforeEach(async () => {
    [wallet, otherWallet, admin] = await ethers.getSigners();
    [cmk, nft, credmarkRewards] = await waffle.loadFixture(fixture);

    merkleTree = new MerkleTree(
      leaves.map((leaf) => encodeLeaf(leaf)),
      utils.keccak256,
      { sort: true }
    );
  });

  describe('#deploy', () => {
    it('should deploy', () => {});
  });

  describe('#setMerkleRoot', () => {
    it('should allow setting root', async () => {
      const root = merkleTree.getHexRoot();
      await credmarkRewards.connect(admin).setMerkleRoot(root);

      const newRoot = await credmarkRewards.merkleRoot();
      expect(newRoot).to.equal(root);
    });

    it('should not allow setting root for non admin', async () => {
      await expect(credmarkRewards.setMerkleRoot(merkleTree.getHexRoot())).to.be
        .reverted;
    });

    it('should fail on setting root more than once', async () => {
      const root = merkleTree.getHexRoot();
      await credmarkRewards.connect(admin).setMerkleRoot(root);
      await expect(
        credmarkRewards.connect(admin).setMerkleRoot(merkleTree.getHexRoot())
      ).to.be.revertedWith('Root already set');
    });
  });

  describe('#claimRewards', () => {
    it('should allow claiming rewards', async () => {
      await cmk
        .connect(admin)
        .transfer(
          credmarkRewards.address,
          BigNumber.from(100).mul(1e6).mul(BigNumber.from(10).pow(18))
        );

      await nft.safeMint(wallet.address); // 0
      await nft.safeMint(wallet.address); // 1
      await nft.safeMint(wallet.address); // 2

      await nft.safeMint(otherWallet.address); // 3
      await nft.safeMint(otherWallet.address); // 4
      await nft.safeMint(otherWallet.address); // 5

      await credmarkRewards
        .connect(admin)
        .setMerkleRoot(merkleTree.getHexRoot());

      for (const leaf of leaves) {
        const tokenOwner = await nft.ownerOf(leaf.tokenId);
        await expect(
          credmarkRewards.claimRewards(
            leaf.tokenId,
            leaf.amount,
            merkleTree.getHexProof(encodeLeaf(leaf))
          )
        )
          .to.emit(credmarkRewards, 'RewardsClaimed')
          .withArgs(tokenOwner, leaf.amount);
      }
    });

    it('should claim rewards only once', async () => {
      await cmk
        .connect(admin)
        .transfer(
          credmarkRewards.address,
          BigNumber.from(100).mul(1e6).mul(BigNumber.from(10).pow(18))
        );

      await nft.safeMint(wallet.address); // 0

      await credmarkRewards
        .connect(admin)
        .setMerkleRoot(merkleTree.getHexRoot());

      const leaf = leaves[0];
      await expect(
        credmarkRewards.claimRewards(
          leaf.tokenId,
          leaf.amount,
          merkleTree.getHexProof(encodeLeaf(leaf))
        )
      )
        .to.emit(credmarkRewards, 'RewardsClaimed')
        .withArgs(wallet.address, leaf.amount);

      await expect(
        credmarkRewards.claimRewards(
          leaf.tokenId,
          leaf.amount,
          merkleTree.getHexProof(encodeLeaf(leaf))
        )
      )
        .to.emit(credmarkRewards, 'RewardsClaimed')
        .withArgs(wallet.address, BigNumber.from(0));
    });

    it('should fail to claim rewards for unminted nft', async () => {
      await cmk
        .connect(admin)
        .transfer(
          credmarkRewards.address,
          BigNumber.from(100).mul(1e6).mul(BigNumber.from(10).pow(18))
        );

      await credmarkRewards
        .connect(admin)
        .setMerkleRoot(merkleTree.getHexRoot());

      const leaf = leaves[0];
      await expect(
        credmarkRewards.claimRewards(
          leaf.tokenId,
          leaf.amount,
          merkleTree.getHexProof(encodeLeaf(leaf))
        )
      ).to.be.revertedWith('ERC721: owner query for nonexistent token');
    });

    it('should fail to claim rewards for wrong amount', async () => {
      await cmk
        .connect(admin)
        .transfer(
          credmarkRewards.address,
          BigNumber.from(100).mul(1e6).mul(BigNumber.from(10).pow(18))
        );

      await nft.safeMint(wallet.address); // 0

      await credmarkRewards
        .connect(admin)
        .setMerkleRoot(merkleTree.getHexRoot());

      const leaf = leaves[0];
      await expect(
        credmarkRewards.claimRewards(
          leaf.tokenId,
          leaf.amount.add(1),
          merkleTree.getHexProof(encodeLeaf(leaf))
        )
      ).to.be.revertedWith('Invalid proof');

      await expect(
        credmarkRewards.claimRewards(
          leaf.tokenId,
          leaf.amount,
          merkleTree.getHexProof(
            encodeLeaf({ tokenId: leaf.tokenId, amount: leaf.amount.add(1) })
          )
        )
      ).to.be.revertedWith('Invalid proof');
    });

    it('should reward to owner of nft only', async () => {
      await cmk
        .connect(admin)
        .transfer(
          credmarkRewards.address,
          BigNumber.from(100).mul(1e6).mul(BigNumber.from(10).pow(18))
        );

      await nft.safeMint(wallet.address); // 0

      await credmarkRewards
        .connect(admin)
        .setMerkleRoot(merkleTree.getHexRoot());

      const leaf = leaves[0];
      await expect(
        credmarkRewards
          .connect(otherWallet)
          .claimRewards(
            leaf.tokenId,
            leaf.amount,
            merkleTree.getHexProof(encodeLeaf(leaf))
          )
      )
        .to.emit(credmarkRewards, 'RewardsClaimed')
        .withArgs(wallet.address, leaf.amount);

      expect(await cmk.balanceOf(wallet.address)).to.equal(leaf.amount);
      expect(await cmk.balanceOf(otherWallet.address)).to.equal(
        BigNumber.from(0)
      );
    });
  });
});
