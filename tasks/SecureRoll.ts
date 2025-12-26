import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("secure-roll:address", "Prints the SecureRoll address").setAction(async function (
  _taskArguments: TaskArguments,
  hre,
) {
  const { deployments } = hre;
  const deployment = await deployments.get("SecureRoll");
  console.log("SecureRoll address is " + deployment.address);
});

task("secure-roll:decrypt-points", "Decrypts a player's encrypted points")
  .addOptionalParam("address", "Optionally specify the SecureRoll contract address")
  .addOptionalParam("player", "Optionally specify the player address (defaults to signer[0])")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("SecureRoll");
    const signers = await ethers.getSigners();
    const player = (taskArguments.player as string | undefined) ?? signers[0].address;

    const secureRoll = await ethers.getContractAt("SecureRoll", deployment.address);
    const encryptedPoints = await secureRoll.getEncryptedPoints(player);

    if (encryptedPoints === ethers.ZeroHash) {
      console.log(`Player=${player} points=0`);
      return;
    }

    const clearPoints = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedPoints,
      deployment.address,
      signers[0],
    );
    console.log(`Player=${player} points=${clearPoints}`);
  });

task("secure-roll:buy", "Buys points with ETH")
  .addOptionalParam("address", "Optionally specify the SecureRoll contract address")
  .addParam("eth", "ETH amount to send, e.g. 0.1")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("SecureRoll");
    const signers = await ethers.getSigners();
    const secureRoll = await ethers.getContractAt("SecureRoll", deployment.address);

    const value = ethers.parseEther(String(taskArguments.eth));
    const tx = await secureRoll.connect(signers[0]).buyPoints({ value });
    console.log(`Wait for tx:${tx.hash}...`);
    await tx.wait();

    const encryptedPoints = await secureRoll.getEncryptedPoints(signers[0].address);
    const clearPoints =
      encryptedPoints === ethers.ZeroHash
        ? 0n
        : await fhevm.userDecryptEuint(FhevmType.euint64, encryptedPoints, deployment.address, signers[0]);

    console.log(`Bought points. Player=${signers[0].address} points=${clearPoints}`);
  });

task("secure-roll:start", "Starts a new round and decrypts the dice for signer[0]")
  .addOptionalParam("address", "Optionally specify the SecureRoll contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("SecureRoll");
    const signers = await ethers.getSigners();
    const secureRoll = await ethers.getContractAt("SecureRoll", deployment.address);

    const tx = await secureRoll.connect(signers[0]).startGame();
    console.log(`Wait for tx:${tx.hash}...`);
    await tx.wait();

    const encryptedDice = await secureRoll.getLastEncryptedDice(signers[0].address);
    const clearDice =
      encryptedDice === ethers.ZeroHash
        ? 0n
        : await fhevm.userDecryptEuint(FhevmType.euint8, encryptedDice, deployment.address, signers[0]);

    console.log(`Dice=${clearDice} (1-6)`);
  });

task("secure-roll:guess", "Submits an encrypted guess: 1=big, 2=small")
  .addOptionalParam("address", "Optionally specify the SecureRoll contract address")
  .addParam("guess", "1 for big, 2 for small")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const guess = Number.parseInt(String(taskArguments.guess), 10);
    if (guess !== 1 && guess !== 2) {
      throw new Error(`Argument --guess must be 1 (big) or 2 (small)`);
    }

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address ? { address: taskArguments.address } : await deployments.get("SecureRoll");
    const signers = await ethers.getSigners();
    const secureRoll = await ethers.getContractAt("SecureRoll", deployment.address);

    const encryptedInput = await fhevm
      .createEncryptedInput(deployment.address, signers[0].address)
      .add8(guess)
      .encrypt();

    const tx = await secureRoll.connect(signers[0]).submitGuess(encryptedInput.handles[0], encryptedInput.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    await tx.wait();

    const rewardHandle = await secureRoll.getLastEncryptedReward(signers[0].address);
    const reward =
      rewardHandle === ethers.ZeroHash
        ? 0n
        : await fhevm.userDecryptEuint(FhevmType.euint64, rewardHandle, deployment.address, signers[0]);

    console.log(`Reward=${reward}`);
  });

