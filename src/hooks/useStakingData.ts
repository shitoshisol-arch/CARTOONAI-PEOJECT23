import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  CLUSTER,
  CONFIG_READY,
  STAKE_POOL_ADDRESS,
  TOKEN_MINT,
} from "../lib/config";
import { getStakingClient } from "../lib/streamflow/client";
import {
  loadAdminSnapshot,
  loadPoolSnapshot,
  loadUserSnapshot,
  type AdminSnapshot,
  type PoolSnapshot,
  type UserSnapshot,
} from "../lib/streamflow/reads";
import { describeError } from "../lib/streamflow/actions";

interface StakingState {
  pool: PoolSnapshot | null;
  user: UserSnapshot | null;
  loading: boolean;
  error: string | null;
  lastSync: number | null;
}

const INITIAL: StakingState = {
  pool: null,
  user: null,
  loading: false,
  error: null,
  lastSync: null,
};

export function useStakingData() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [state, setState] = useState<StakingState>(INITIAL);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!CONFIG_READY || !TOKEN_MINT || !STAKE_POOL_ADDRESS) {
      setState({ ...INITIAL, loading: false });
      return;
    }

    const id = ++requestId.current;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    try {
      const client = getStakingClient();
      const pool = await loadPoolSnapshot(
        client,
        connection,
        CLUSTER,
        TOKEN_MINT,
        STAKE_POOL_ADDRESS,
      );
      if (id !== requestId.current) return;

      let user: UserSnapshot | null = null;
      if (publicKey) {
        try {
          user = await loadUserSnapshot(client, connection, pool, publicKey);
        } catch (userError) {
          if (id !== requestId.current) return;
          setState((previous) => ({
            ...previous,
            pool,
            user: null,
            loading: false,
            error: `POSITION READ FAILED: ${describeError(userError)}`,
            lastSync: Date.now(),
          }));
          return;
        }
      }

      if (id !== requestId.current) return;
      setState({
        pool,
        user,
        loading: false,
        error: null,
        lastSync: Date.now(),
      });
    } catch (error) {
      if (id !== requestId.current) return;
      setState((previous) => ({
        ...previous,
        loading: false,
        error: describeError(error),
      }));
    }
  }, [connection, publicKey]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return { ...state, refresh };
}

interface AdminState {
  snapshot: AdminSnapshot | null;
  loading: boolean;
  error: string | null;
  lastSync: number | null;
}

export function useAdminData() {
  const { connection } = useConnection();
  const [state, setState] = useState<AdminState>({
    snapshot: null,
    loading: false,
    error: null,
    lastSync: null,
  });
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!CONFIG_READY || !TOKEN_MINT || !STAKE_POOL_ADDRESS) {
      setState({ snapshot: null, loading: false, error: null, lastSync: null });
      return;
    }
    const id = ++requestId.current;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    try {
      const client = getStakingClient();
      const pool = await loadPoolSnapshot(
        client,
        connection,
        CLUSTER,
        TOKEN_MINT,
        STAKE_POOL_ADDRESS,
      );
      const snapshot = await loadAdminSnapshot(client, connection, pool);
      if (id !== requestId.current) return;
      setState({
        snapshot,
        loading: false,
        error: null,
        lastSync: Date.now(),
      });
    } catch (error) {
      if (id !== requestId.current) return;
      setState((previous) => ({
        ...previous,
        loading: false,
        error: describeError(error),
      }));
    }
  }, [connection]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 45_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { ...state, refresh };
}
