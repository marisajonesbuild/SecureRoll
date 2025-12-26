import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedSecureRoll = await deploy("SecureRoll", {
    from: deployer,
    log: true,
  });

  console.log(`SecureRoll contract: `, deployedSecureRoll.address);
};
export default func;
func.id = "deploy_secureRoll"; // id required to prevent reexecution
func.tags = ["SecureRoll"];
