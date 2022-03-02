import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai, { expect } from 'chai';
import { BigNumber } from 'ethers';
import { joinSignature } from 'ethers/lib/utils';
import { ethers, waffle } from 'hardhat';
import { CredmarkModeler, CredmarkModel, IERC20 } from '../typechain';
import { FakeContract, smock } from "@defi-wonderland/smock";

chai.use(smock.matchers);

describe('Credmark Modeler', () => {
    let credmarkModeler: CredmarkModeler;
    let credmarkModel: CredmarkModel;
    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;
    let minterRole = ethers.utils.id("MINTER_ROLE");
    let pauserRole = ethers.utils.id("PAUSER_ROLE");

    let erc20Fake : FakeContract<IERC20>;

    const ZERO_ADDRESS =  ethers.utils.getAddress("0x0000000000000000000000000000000000000000");
    const MINT_COST = BigNumber.from(1);
    beforeEach(async () => {

        const credmarkModelFactory = await ethers.getContractFactory('CredmarkModel');
        credmarkModel = (await credmarkModelFactory.deploy()) as CredmarkModel;

        erc20Fake = await smock.fake<IERC20>("IERC20");

        const credmarkModelerFactory = await ethers.getContractFactory('CredmarkModeler');
        credmarkModeler = (await credmarkModelerFactory.deploy(
            credmarkModel.address,
            erc20Fake.address,
            MINT_COST
        )) as CredmarkModeler;
        
        [deployer, alice, bob] = await ethers.getSigners();
    });

    it('should construct', async () => {
        expect(await credmarkModeler.name()).to.equal('CredmarkModeler');
        expect(await credmarkModeler.symbol()).to.equal('CMKmlr');
        expect(await credmarkModeler.hasRole(minterRole, deployer.address)).to.equal(true);
        expect(await credmarkModeler.hasRole(pauserRole, deployer.address)).to.equal(true);

    })

    describe('#pause/unpause', () => {
        it('must be done by deployer', async () => {
            //pause by deployer
            await credmarkModeler.connect(deployer).pause();
            expect(await credmarkModeler.paused()).to.equal(true);
            
            //unpuase by pauser
            await credmarkModeler.grantRole(pauserRole, alice.address);

            await credmarkModeler.connect(alice).unpause();
            expect(await credmarkModeler.paused()).to.equal(false);

        });

        it('should not be done by non-deployer', async () => {
            await expect(credmarkModeler.connect(alice).pause()).to.be.reverted;
            await expect(credmarkModeler.connect(alice).unpause()).to.be.reverted;

        })
    });

    describe('#set model contract', () => {
        it('should be done my admin', async () => {
            await expect(credmarkModeler.connect(alice).setModelContract(credmarkModel.address))
            .to.be.reverted;
        })

        it('should set model contract', async () => {
            await expect(credmarkModeler.connect(deployer).setModelContract(credmarkModel.address))
            .emit(credmarkModeler, "ModelContractSet");
        })

        it('should not set if null contract', async () => {
            await expect(credmarkModeler.connect(deployer).setModelContract(ZERO_ADDRESS))
            .to.be.revertedWith("Model contract can not be null");
        })
    })

    describe('#set mint token', () => {

        it('should be done by admin', async () => {
            await expect(credmarkModeler.connect(alice).setMintToken(erc20Fake.address))
            .to.be.reverted;
        })

        it('should set mint token contract', async () => {
            await expect(credmarkModeler.connect(deployer).setMintToken(erc20Fake.address))
            .emit(credmarkModeler, "MintTokenSet")
            .withArgs(erc20Fake.address)
        })

        it('should not set if null contract', async () => {
            await expect(credmarkModeler.connect(deployer).setMintToken(ZERO_ADDRESS))
            .to.be.revertedWith("Mint token contract can not be null");
        })

    })

    describe('#set mint cost', () => {
        
        it('should be done by admin', async () => {
            await expect(credmarkModeler.connect(alice).setMintCost(MINT_COST))
            .to.be.reverted;
        })
        
        it('should set mint const', async () => {
            await expect(credmarkModeler.connect(deployer).setMintCost(MINT_COST))
            .emit(credmarkModeler, "MintCostSet")
            .withArgs(MINT_COST)
        })

        it('should not set if value is zero', async () => {
            await expect(credmarkModeler.connect(deployer).setMintCost(0))
            .to.be.revertedWith("Mint cost can not be zero")
        })
    })

    describe('#mint', () => {
        const tokenId = BigNumber.from(0);

        it('must be done by MINTER_ROLE', async () => {
            await expect(credmarkModeler.connect(alice).safeMint(alice.address)).to.reverted;

            //grant minter role to normal user

            await credmarkModeler.connect(deployer).grantRole(minterRole, alice.address);
            
            await expect(
                credmarkModeler.connect(alice).safeMint
                (bob.address)
                )
                .to.emit(credmarkModeler, "NFTMinted")
                .withArgs(tokenId);
                });


        it('Check if minted successfully', async () => {
            await credmarkModeler.connect(deployer).safeMint(alice.address);
            expect(await credmarkModeler.balanceOf(alice.address)).to.equal(1);

        })

    })

}) 