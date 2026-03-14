/**
 * 지표 등록 파일
 *
 * 새 지표 추가 방법:
 *   1. indicators/ 아래에 파일 생성 (IndicatorDef 인터페이스 구현)
 *   2. 아래 ALL_INDICATORS 배열에 추가
 *   → 버튼 + 차트 렌더링에 자동 반영
 */

import { ma5, ma20, ma60, ma120 } from './ma'
import { bollingerBands } from './bb'
import { grid } from './grid'
import { ichimoku } from './ichimoku'
import { volumeProfile } from './volume-profile'
import type { IndicatorDef } from './types'

export type { IndicatorDef }
export type { IndicatorContext } from './types'

export const ALL_INDICATORS: IndicatorDef[] = [
  ma5,
  ma20,
  ma60,
  ma120,
  bollingerBands,
  grid,
  ichimoku,
  volumeProfile,
]
