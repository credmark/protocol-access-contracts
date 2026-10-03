import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { CredmarkModel, CredmarkModeler, MockCMK } from '../typechain-types';

describe('Credmark Modeler', () => {
  let credmarkModeler: CredmarkModeler;
  let credmarkModel: CredmarkModel;
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  const minterRole = ethers.id('MINTER_ROLE');
  const pauserRole = ethers.id('PAUSER_ROLE');

  let mockCMK: MockCMK;

  const ZERO_ADDRESS = ethers.getAddress(
    '0x0000000000000000000000000000000000000000'
  );
  const MINT_COST = BigInt(1);

  beforeEach(async () => {
    const credmarkModelFactory = await ethers.getContractFactory(
      'CredmarkModel'
    );
    credmarkModel = (await credmarkModelFactory.deploy()) as unknown as CredmarkModel;

    const mockCMKFactory = await ethers.getContractFactory('MockCMK');
    mockCMK = (await mockCMKFactory.deploy()) as unknown as MockCMK;

    const credmarkModelerFactory = await ethers.getContractFactory(
      'CredmarkModeler'
    );
    credmarkModeler = (await credmarkModelerFactory.deploy(
      await credmarkModel.getAddress(),
      await mockCMK.getAddress(),
      MINT_COST
    )) as unknown as CredmarkModeler;

    [deployer, alice, bob] = await ethers.getSigners();
  });

  it('should construct', async () => {
    expect(await credmarkModeler.name()).to.equal('CredmarkModeler');
    expect(await credmarkModeler.symbol()).to.equal('CMKmlr');
    expect(
      await credmarkModeler.hasRole(minterRole, await deployer.getAddress())
    ).to.equal(true);
    expect(
      await credmarkModeler.hasRole(pauserRole, await deployer.getAddress())
    ).to.equal(true);
  });

  describe('#pause/unpause', () => {
    it('must be done by deployer', async () => {
      // pause by deployer
      await credmarkModeler.connect(deployer).pause();
      expect(await credmarkModeler.paused()).to.equal(true);

      // unpuase by pauser
      await credmarkModeler.grantRole(pauserRole, await alice.getAddress());

      await credmarkModeler.connect(alice).unpause();
      expect(await credmarkModeler.paused()).to.equal(false);
    });

    it('should not be done by non-deployer', async () => {
      await expect(credmarkModeler.connect(alice).pause()).to.be.reverted;
      await expect(credmarkModeler.connect(alice).unpause()).to.be.reverted;
    });
  });

  describe('#set model contract', () => {
    it('should be done my admin', async () => {
      await expect(
        credmarkModeler.connect(alice).setModelContract(await credmarkModel.getAddress())
      ).to.be.reverted;
    });

    it('should set model contract', async () => {
      await expect(
        credmarkModeler
          .connect(deployer)
          .setModelContract(await credmarkModel.getAddress())
      )
        .emit(credmarkModeler, 'ModelContractSet')
        .withArgs(await credmarkModel.getAddress());
    });

    it('should not set if null contract', async () => {
      await expect(
        credmarkModeler.connect(deployer).setModelContract(ZERO_ADDRESS)
      ).to.be.revertedWith('Model contract can not be null');
    });
  });

  describe('#set mint token', () => {
    it('should be done by admin', async () => {
      await expect(credmarkModeler.connect(alice).setMintToken(await mockCMK.getAddress()))
        .to.be.reverted;
    });

    it('should set mint token contract', async () => {
      await expect(
        credmarkModeler.connect(deployer).setMintToken(await mockCMK.getAddress())
      )
        .emit(credmarkModeler, 'MintTokenSet')
        .withArgs(await mockCMK.getAddress());
    });

    it('should not set if null contract', async () => {
      await expect(
        credmarkModeler.connect(deployer).setMintToken(ZERO_ADDRESS)
      ).to.be.revertedWith('Mint token contract can not be null');
    });
  });

  describe('#set mint cost', () => {
    it('should be done by admin', async () => {
      await expect(credmarkModeler.connect(alice).setMintCost(MINT_COST)).to.be
        .reverted;
    });

    it('should set mint const', async () => {
      await expect(credmarkModeler.connect(deployer).setMintCost(MINT_COST))
        .emit(credmarkModeler, 'MintCostSet')
        .withArgs(MINT_COST);
    });

    it('should not set if value is zero', async () => {
      await expect(
        credmarkModeler.connect(deployer).setMintCost(0)
      ).to.be.revertedWith('Mint cost can not be zero');
    });
  });

  describe('#mint', () => {
    const tokenId = BigInt(0);

    it('should be done by MINTER_ROLE', async () => {
      await mockCMK.transfer(await alice.getAddress(), BigInt(100));

      await mockCMK
        .connect(alice)
        .approve(await credmarkModeler.getAddress(), BigInt(10));

      await expect(credmarkModeler.connect(alice).safeMint(await alice.getAddress())).to
        .reverted;

      // grant minter role to normal user

      await credmarkModeler
        .connect(deployer)
        .grantRole(minterRole, await alice.getAddress());

      await expect(credmarkModeler.connect(alice).safeMint(await bob.getAddress()))
        .to.emit(credmarkModeler, 'NFTMinted')
        .withArgs(tokenId);
    });

    it('should mint nft', async () => {
      await mockCMK.transfer(await deployer.getAddress(), BigInt(100));

      await mockCMK
        .connect(deployer)
        .approve(await credmarkModeler.getAddress(), BigInt(10));

      await credmarkModeler.connect(deployer).safeMint(await alice.getAddress());
      expect(await credmarkModeler.balanceOf(await alice.getAddress())).to.equal(1);
    });
  });
});
