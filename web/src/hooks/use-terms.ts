import { useEffect, useState } from 'react';
import { getTerms } from '@/api/client';
import { DEFAULT_TERMS } from '@/lib/dashboard-constants';

/** 拉取当前/历史学期列表，失败时回退到 DEFAULT_TERMS。 */
export function useTerms() {
  const [terms, setTerms] = useState<string[]>(DEFAULT_TERMS);

  useEffect(() => {
    getTerms()
      .then((res) => {
        if (res.ok && Array.isArray(res.terms) && res.terms.length > 0) {
          setTerms(res.terms);
        }
      })
      .catch(() => {
        /* fallback to DEFAULT_TERMS */
      });
  }, []);

  return terms;
}
