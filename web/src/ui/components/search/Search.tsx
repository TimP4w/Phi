import { observer } from "mobx-react-lite";
import "./search.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useState } from "react";

export type FilterCategory<T> = {
  label: string;
  filters: Filter<T>[];
};

export type Filter<T> = {
  label: string;
  filter: (a: T) => boolean;
};

type SearchProps = {
  onChange(value: string): void;
  onFilterChange: (filter: (a: never) => boolean) => void;
  filters?: FilterCategory<never>[];
};

const Search: React.FC<SearchProps> = observer(
  ({ onChange, onFilterChange, filters }: SearchProps) => {
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [selectedFilters, setFilters] = useState<
      Map<string, Filter<never>[]>
    >(new Map<string, Filter<never>[]>());
    const onType = (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(event.target.value);
    };

    const onFilterSelect = (
      filter: Filter<never>,
      filterCategoryName: string
    ) => {
      if (isFilterChecked(filter, filterCategoryName)) {
        selectedFilters.set(
          filterCategoryName,
          selectedFilters
            .get(filterCategoryName)
            ?.filter((f) => f !== filter) || []
        );
        setFilters(selectedFilters);
      } else {
        if (!selectedFilters.get(filterCategoryName)) {
          selectedFilters.set(filterCategoryName, []);
        }
        selectedFilters.set(filterCategoryName, [
          ...(selectedFilters.get(filterCategoryName) || []),
          filter,
        ]);
        setFilters(selectedFilters);
      }

      if (
        Array.from(selectedFilters.values())
          .map((f: Filter<never>[]) => f.length)
          .reduce((a: number, b: number) => a + b) === 0
      ) {
        onFilterChange(() => true);
        return;
      }

      const filterFunc = Array.from(selectedFilters.values())
        .filter((filters) => filters.length > 0)
        .map((filters: Filter<never>[]) =>
          filters
            .map((filters) => filters.filter)
            .reduce((a, b) => (x) => a(x) || b(x))
        )
        .reduce((a, b) => (x) => a(x) && b(x));

      onFilterChange(filterFunc);
    };

    const isFilterChecked = useCallback(
      (filter: Filter<never>, filterCategoryName: string) => {
        return selectedFilters.get(filterCategoryName)?.includes(filter);
      },
      [selectedFilters]
    );

    return (
      <div className="search">
        <div className="search__container">
          <div
            onClick={() => {
              setIsFilterOpen(!isFilterOpen);
            }}
            className="search__filter-icon"
          >
            <FontAwesomeIcon icon="filter" />
          </div>
          <input
            className="search__bar"
            placeholder="Search..."
            onChange={onType}
          ></input>
        </div>

        {isFilterOpen && (
          <div className="search__filter-container">
            {filters?.map((filterCategory) => (
              <div
                key={filterCategory.label}
                className="search__filter-category"
              >
                <span>{filterCategory.label}</span>
                {filterCategory.filters?.map((filter, index) => (
                  <div
                    key={`${filter.label}_${index}`}
                    className="search__filter-checkbox"
                  >
                    <input
                      type="checkbox"
                      checked={isFilterChecked(filter, filterCategory.label)}
                      onChange={() =>
                        onFilterSelect(filter, filterCategory.label)
                      }
                      id={`${filterCategory.label}_${filter.label}`}
                      name={`${filterCategory.label}_${filter.label}`}
                    />
                    <label htmlFor={`${filterCategory.label}_${filter.label}`}>
                      {filter.label}
                    </label>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);

export default Search;
