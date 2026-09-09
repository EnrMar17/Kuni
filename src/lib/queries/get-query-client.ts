import "server-only";
import { cache } from "react";
import { QueryClient } from "@tanstack/react-query";

import { queryClientDefaultOptions } from "@/lib/queries/query-client-options";

/**
 * QueryClient de servidor para hidratación (patrón oficial de TanStack Query
 * + Next App Router): `cache()` de React lo hace único por request, nunca
 * compartido entre usuarios ni reutilizado entre requests distintos.
 */
export const getQueryClient = cache(() => new QueryClient({ defaultOptions: queryClientDefaultOptions }));
