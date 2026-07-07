import type { LamarckGenome } from "../genome-types";
import type { ObjectiveVector } from "./domination";
import { dominates } from "./domination";

type DeepReadonly<TValue> = TValue extends (infer UValue)[]
	? readonly DeepReadonly<UValue>[]
	: TValue extends object
		? { readonly [KValue in keyof TValue]: DeepReadonly<TValue[KValue]> }
		: TValue;

export class ParetoArchive {
	private _members: DeepReadonly<LamarckGenome>[] = [];
	private _objs: ObjectiveVector[] = [];

	update(
		genomes: DeepReadonly<LamarckGenome>[],
		objectives: ObjectiveVector[]
	): boolean {
		let changed = false;

		for (let ci = 0; ci < genomes.length; ci++) {
			const cObj = objectives[ci];
			if (this._objs.some((aObj) => dominates(aObj, cObj))) {
				continue;
			}

			const keep = this._members.map(
				(_, ai) => !dominates(cObj, this._objs[ai])
			);
			this._members = [
				...this._members.filter((_unused, index) => keep[index]),
				genomes[ci],
			];
			this._objs = [
				...this._objs.filter((_unused, index) => keep[index]),
				cObj,
			];
			changed = true;
		}

		return changed;
	}

	get members(): DeepReadonly<LamarckGenome>[] {
		return this._members;
	}
	get size(): number {
		return this._members.length;
	}
}
