// 이미지·HTML 뷰어가 함께 쓰는 탐색/댓글 모드 전환. 눌린 상태는 색으로 표시한다(글자 굵기를 바꾸면 폭이 변한다).
export function ModeToggle({
  commentMode,
  disabled,
  onChange,
}: {
  commentMode: boolean;
  disabled?: boolean;
  onChange: (comment: boolean) => void;
}) {
  return (
    <div className="mode-toggle">
      <button
        type="button"
        aria-pressed={!commentMode}
        disabled={disabled}
        onClick={() => onChange(false)}
      >
        탐색 모드
      </button>
      <button
        type="button"
        aria-pressed={commentMode}
        disabled={disabled}
        onClick={() => onChange(true)}
      >
        댓글 모드
      </button>
    </div>
  );
}
