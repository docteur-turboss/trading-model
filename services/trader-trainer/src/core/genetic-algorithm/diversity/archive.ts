import type { Genome } from "../genome-types";
import { noveltyScore } from "./novelty";

export interface NoveltyArchiveConfig {
	threshold?: number;
	maxSize?: number;
	population?: Genome[];
}

export interface NoveltyArchiveUpdateContext {
	genome: Genome;
	archive: Genome[];
	score: number;
	config?: NoveltyArchiveConfig;
}

function _resolveArchiveConfig(
	configArg?: NoveltyArchiveConfig
): Required<NoveltyArchiveConfig> {
	return {
		threshold: configArg?.threshold ?? 0.1,
		maxSize: configArg?.maxSize ?? 500,
		population: configArg?.population ?? [],
	};
}

function _evictLeastNovel(
	archive: Genome[],
	score: number,
	population: Genome[]
): void {
	const scores = archive.map((member, index) =>
		index === archive.length - 1
			? score
			: noveltyScore(member, population, archive)
	);
	const minIdx = scores.indexOf(Math.min(...scores));
	archive.splice(minIdx, 1);
}

export function updateNoveltyArchive(
	ctx: NoveltyArchiveUpdateContext
): Genome[] {
	const { genome, archive, score } = ctx;
	const config = _resolveArchiveConfig(ctx.config);
	if (score < config.threshold) {
		return archive;
	}
	archive.push(genome);
	if (archive.length > config.maxSize) {
		_evictLeastNovel(archive, score, config.population);
	}
	return archive;
}
