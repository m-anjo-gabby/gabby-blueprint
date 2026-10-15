'use server';

import { cache } from 'react';
import { getMyCoachRatingStatsCore } from '@gabby/lib/coachRating/actions/coachRatingActions';
import type { CoachRatingStats } from '@gabby/types/coachRating';

/** 自分の評価の集計（評価がまだ無い場合は null。1リクエスト内で1回にまとめる） */
export const getMyCoachRatingStats = cache(async (): Promise<CoachRatingStats | null> => getMyCoachRatingStatsCore());
