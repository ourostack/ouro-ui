import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination"

// Every page when there are few, otherwise the first, the last and the pages
// around the current one, with gaps marked by `null`.
function pageItems(page: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1)
  }
  if (page <= 4) return [1, 2, 3, 4, 5, null, pageCount]
  if (page >= pageCount - 3) {
    return [1, null, ...Array.from({ length: 5 }, (_, index) => pageCount - 4 + index)]
  }
  return [1, null, page - 1, page, page + 1, null, pageCount]
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
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeftIcon data-icon="inline-start" />
            Previous
          </Button>
        </PaginationItem>
        {pageItems(page, pageCount).map((item, index) => (
          <PaginationItem key={item ?? `gap-${index}`}>
            {item === null ? (
              <PaginationEllipsis />
            ) : (
              <Button
                variant={item === page ? "outline" : "ghost"}
                size="icon"
                aria-current={item === page ? "page" : undefined}
                onClick={() => onPageChange(item)}
              >
                {item}
              </Button>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <Button
            variant="ghost"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            Next
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
