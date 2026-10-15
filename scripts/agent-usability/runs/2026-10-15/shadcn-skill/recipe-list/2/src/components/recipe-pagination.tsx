import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination"

/** Page numbers to show, with null for a gap. Keeps the bar short when there are many pages. */
function pageRange(page: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)
  const start = Math.max(2, Math.min(page - 1, pageCount - 4))
  const end = Math.min(pageCount - 1, Math.max(page + 1, 5))
  const pages: (number | null)[] = [1]
  if (start > 2) pages.push(null)
  for (let n = start; n <= end; n++) pages.push(n)
  if (end < pageCount - 1) pages.push(null)
  pages.push(pageCount)
  return pages
}

export function RecipePagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
}) {
  return (
    <Pagination aria-label="Pagination">
      <PaginationContent className="flex-wrap justify-center">
        <PaginationItem>
          <Button
            variant="ghost"
            aria-label="Previous"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeftIcon data-icon="inline-start" />
            <span className="hidden sm:inline">Previous</span>
          </Button>
        </PaginationItem>
        {pageRange(page, pageCount).map((n, index) => (
          <PaginationItem key={n ?? `gap-${index}`}>
            {n === null ? (
              <PaginationEllipsis />
            ) : (
              <Button
                variant={n === page ? "outline" : "ghost"}
                size="icon"
                aria-label={`Go to page ${n}`}
                aria-current={n === page ? "page" : undefined}
                onClick={() => onPageChange(n)}
              >
                {n}
              </Button>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <Button
            variant="ghost"
            aria-label="Next"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
