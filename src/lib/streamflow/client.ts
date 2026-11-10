import { SolanaStakingClient } from "@streamflow/staking";
import { RPC_ENDPOINT, STREAMFLOW_CLUSTER } from "../config";

let cachedClient: SolanaStakingClient | null = null;

export function getStakingClient(): SolanaStakingClient {
  if (!cachedClient) {
    cachedClient = new SolanaStakingClient({
      clusterUrl: RPC_ENDPOINT,
      cluster: STREAMFLOW_CLUSTER,
      commitment: "confirmed",
    });
  }
  return cachedClient;
}

export interface ProgramIdSnapshot {
  stakePool: string;
  rewardPool: string;
  rewardPoolDynamic: string;
  feeManager: string;
}

export function getProtocolProgramIds(): ProgramIdSnapshot {
  const client = getStakingClient();
  return {
    stakePool: client.getCurrentProgramId("stakePoolProgram").toBase58(),
    rewardPool: client.getCurrentProgramId("rewardPoolProgram").toBase58(),
    rewardPoolDynamic: client.getCurrentProgramId("rewardPoolDynamicProgram").toBase58(),
    feeManager: client.getCurrentProgramId("feeManagerProgram").toBase58(),
  };
}
