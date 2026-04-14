import type { RPCParams, RPCResult } from '@cushion/types';
import type { SnapshotManager } from '../snapshot/snapshot-manager';

export async function handleSnapshotTrack(
  manager: SnapshotManager,
  params: RPCParams<'snapshot/track'>,
): Promise<RPCResult<'snapshot/track'>> {
  return manager.track(params);
}

export async function handleSnapshotRevertToMessage(
  manager: SnapshotManager,
  params: RPCParams<'snapshot/revertToMessage'>,
): Promise<RPCResult<'snapshot/revertToMessage'>> {
  return manager.revertToMessage(params);
}

export async function handleSnapshotUnrevert(
  manager: SnapshotManager,
  params: RPCParams<'snapshot/unrevert'>,
): Promise<RPCResult<'snapshot/unrevert'>> {
  return manager.unrevert(params);
}

export async function handleSnapshotDiff(
  manager: SnapshotManager,
  params: RPCParams<'snapshot/diff'>,
): Promise<RPCResult<'snapshot/diff'>> {
  return manager.diff(params.snapshotId);
}

export async function handleSnapshotList(
  manager: SnapshotManager,
  params: RPCParams<'snapshot/list'>,
): Promise<RPCResult<'snapshot/list'>> {
  return manager.list(params);
}
