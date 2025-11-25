export interface SearchResultWithId {
  id: string;
  type: 'customer' | 'service' | 'lead' | 'work';
  name: string;
  subtitle?: string;
}

export const getNavigationTarget = (result: SearchResultWithId): { page: string; itemId: string } => {
  switch (result.type) {
    case 'customer':
      return { page: 'customers', itemId: result.id };
    case 'service':
      return { page: 'services', itemId: result.id };
    case 'lead':
      return { page: 'leads', itemId: result.id };
    case 'work':
      return { page: 'works', itemId: result.id };
    default:
      return { page: 'dashboard', itemId: '' };
  }
};

export const createNavigationState = (itemId: string, itemType: string) => {
  return {
    selectedId: itemId,
    itemType: itemType,
    shouldShowDetails: true,
  };
};
