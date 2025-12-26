import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { SecureRoll, SecureRoll__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("SecureRoll")) as SecureRoll__factory;
  const secureRoll = (await factory.deploy()) as SecureRoll;
  const address = await secureRoll.getAddress();
  return { secureRoll, address };
}

describe("SecureRoll", function () {
  let signers: Signers;
  let secureRoll: SecureRoll;
  let secureRollAddress: string;

  before(async function () {
    const ethSigners = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ secureRoll, address: secureRollAddress } = await deployFixture());
  });

  it("quotes 100000 points per 1 ETH", async function () {
    const points = await secureRoll.quotePoints(ethers.parseEther("1"));
    expect(points).to.eq(100000);
  });

  it("buys points and decrypts balance", async function () {
    const tx = await secureRoll.connect(signers.alice).buyPoints({ value: ethers.parseEther("1") });
    await tx.wait();

    const encryptedPoints = await secureRoll.getEncryptedPoints(signers.alice.address);
    expect(encryptedPoints).to.not.eq(ethers.ZeroHash);

    const clearPoints = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedPoints,
      secureRollAddress,
      signers.alice,
    );
    expect(clearPoints).to.eq(100000);
  });

  it("plays a round and receives reward when guessing correctly", async function () {
    let tx = await secureRoll.connect(signers.alice).startGame();
    await tx.wait();

    expect(await secureRoll.hasActiveRound(signers.alice.address)).to.eq(true);

    const encryptedDice = await secureRoll.getLastEncryptedDice(signers.alice.address);
    expect(encryptedDice).to.not.eq(ethers.ZeroHash);

    const clearDice = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encryptedDice,
      secureRollAddress,
      signers.alice,
    );
    expect(clearDice).to.be.greaterThanOrEqual(1);
    expect(clearDice).to.be.lessThanOrEqual(6);

    const correctGuess = clearDice > 3n ? 1 : 2;
    const encryptedGuess = await fhevm
      .createEncryptedInput(secureRollAddress, signers.alice.address)
      .add8(correctGuess)
      .encrypt();

    tx = await secureRoll.connect(signers.alice).submitGuess(encryptedGuess.handles[0], encryptedGuess.inputProof);
    await tx.wait();

    expect(await secureRoll.hasActiveRound(signers.alice.address)).to.eq(false);

    const encryptedReward = await secureRoll.getLastEncryptedReward(signers.alice.address);
    const clearReward = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedReward,
      secureRollAddress,
      signers.alice,
    );
    expect(clearReward).to.eq(10000);

    const encryptedPoints = await secureRoll.getEncryptedPoints(signers.alice.address);
    const clearPoints = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedPoints,
      secureRollAddress,
      signers.alice,
    );
    expect(clearPoints).to.eq(10000);
  });

  it("receives 0 reward when guessing incorrectly", async function () {
    let tx = await secureRoll.connect(signers.alice).startGame();
    await tx.wait();

    const encryptedDice = await secureRoll.getLastEncryptedDice(signers.alice.address);
    const clearDice = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encryptedDice,
      secureRollAddress,
      signers.alice,
    );

    const wrongGuess = clearDice > 3n ? 2 : 1;
    const encryptedGuess = await fhevm
      .createEncryptedInput(secureRollAddress, signers.alice.address)
      .add8(wrongGuess)
      .encrypt();

    tx = await secureRoll.connect(signers.alice).submitGuess(encryptedGuess.handles[0], encryptedGuess.inputProof);
    await tx.wait();

    const encryptedReward = await secureRoll.getLastEncryptedReward(signers.alice.address);
    const clearReward = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedReward,
      secureRollAddress,
      signers.alice,
    );
    expect(clearReward).to.eq(0);
  });
});
