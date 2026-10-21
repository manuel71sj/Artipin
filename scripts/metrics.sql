-- 사업화 판단 지표 3개. 임계값은 첫 2주 데이터를 본 뒤 정한다.
SELECT '전달: 소유자 외 조회가 있는 파일 수' AS metric, COUNT(DISTINCT file_id) AS value FROM views
UNION ALL
SELECT '댓글: 소유자 외 댓글이 있는 파일 수', COUNT(DISTINCT file_id) FROM comments WHERE is_owner = 0
UNION ALL
SELECT '재업로드: 파일을 2개 이상 올렸거나 교체한 적이 있는 소유자 수', COUNT(*) FROM (SELECT owner_id FROM files GROUP BY owner_id HAVING COUNT(*) >= 2 OR COUNT(replaced_at) > 0);
