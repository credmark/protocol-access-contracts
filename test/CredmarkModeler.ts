import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai, { expect } from 'chai';
import { BigNumber } from 'ethers';
import { joinSignature } from 'ethers/lib/utils';
import { ethers, waffle } from 'hardhat';
import { CredmarkModeler, CredmarkModel, MockCMK, IERC20 } from '../typechain';
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

    let mockCMK : MockCMK;

    const ZERO_ADDRESS =  ethers.utils.getAddress("0x0000000000000000000000000000000000000000");
    const MINT_COST = BigNumber.from(1);

    beforeEach(async () => {

        const credmarkModelFactory = await ethers.getContractFactory('CredmarkModel');
        credmarkModel = (await credmarkModelFactory.deploy()) as CredmarkModel;

        const mockCMKFactory = await ethers.getContractFactory('MockCMK');
        mockCMK = (await mockCMKFactory.deploy()) as MockCMK;

        const credmarkModelerFactory = await ethers.getContractFactory('CredmarkModeler');
        credmarkModeler = (await credmarkModelerFactory.deploy(
            credmarkModel.address,
            mockCMK.address,
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
            .emit(credmarkModeler, "ModelContractSet")
            .withArgs(credmarkModel.address);
        })

        it('should not set if null contract', async () => {
            await expect(credmarkModeler.connect(deployer).setModelContract(ZERO_ADDRESS))
            .to.be.revertedWith("Model contract can not be null");
        })
    })

    describe('#set mint token', () => {

        it('should be done by admin', async () => {
            await expect(credmarkModeler.connect(alice).setMintToken(mockCMK.address))
            .to.be.reverted;
        })

        it('should set mint token contract', async () => {
            await expect(credmarkModeler.connect(deployer).setMintToken(mockCMK.address))
            .emit(credmarkModeler, "MintTokenSet")
            .withArgs(mockCMK.address)
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

        it('should be done by MINTER_ROLE', async () => {

            await mockCMK.transfer(alice.address, BigNumber.from(100));
            
            await mockCMK.connect(alice).approve(credmarkModeler.address, BigNumber.from(10));
     
            await expect(credmarkModeler.connect(alice).safeMint(alice.address)).to.reverted;

            //grant minter role to normal user

            await credmarkModeler.connect(deployer).grantRole(minterRole, alice.address);
            
            console.log(await mockCMK.balanceOf(alice.address))

            await expect(
                credmarkModeler.connect(alice).safeMint
                (bob.address)
                )
                .to.emit(credmarkModeler, "NFTMinted")
                .withArgs(tokenId);
                });


        it('should mint nft', async () => {
            await mockCMK.transfer(deployer.address, BigNumber.from(100));
            
            await mockCMK.connect(deployer).approve(credmarkModeler.address, BigNumber.from(10));
     
            await credmarkModeler.connect(deployer).safeMint(alice.address);
            expect(await credmarkModeler.balanceOf(alice.address)).to.equal(1);

        })

    })

}) 