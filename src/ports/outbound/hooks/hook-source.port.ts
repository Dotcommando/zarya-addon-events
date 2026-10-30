import type { IHookChange, IHookCommitIntent } from '../../../domain/hooks/hook-change.js';

export interface IHookSourcePort {
  prepare(change: IHookChange): Promise<IHookCommitIntent>;
}
