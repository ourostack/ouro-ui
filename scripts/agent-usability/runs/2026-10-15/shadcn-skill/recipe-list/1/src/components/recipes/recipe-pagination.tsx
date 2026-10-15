import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination"

/** The pages to show: all of them when there are few, else the ends and the current page's neighbours. */
function visiblePages(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)

  const start = Math.max(2, Math.min(page - 1, pageCount - 4))
  const end = Math.min(pageCount - 1, Math.max(page + 1, 5))
  const pages: (number | "gap")[] = [1]
  if (start > 2) pages.push("gap")
  for (let current = start; current <= end; current++) pages.push(current)
  if (end < pageCount - 1) pages.push("gap")
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
        {visiblePages(page, pageCount).map((item, index) =>
          item === "gap" ? (
            <PaginationItem key={`gap-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <Button
                variant={item === page ? "outline" : "ghost"}
                size="icon"
                aria-label={`Page ${item}`}
                aria-current={item === page ? "page" : undefined}
                onClick={() => onPageChange(item)}
              >
                {item}
              </Button>
            </PaginationItem>
          )
        )}
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
