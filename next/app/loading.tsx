/** Route-level fallback. Deliberately quiet — the in-flow spinners carry copy. */
export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center bg-[#f7f5ef] py-[60px]">
      <div
        className="h-[34px] w-[34px] animate-spin rounded-full border-[3px] border-[#d1d5db] border-t-[#1f4d3d]"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
