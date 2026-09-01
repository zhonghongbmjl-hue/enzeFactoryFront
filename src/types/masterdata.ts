export type MasterDataType =
  | 'organizations'
  | 'factories'
  | 'workshops'
  | 'production-lines'
  | 'warehouses'
  | 'storage-locations'
  | 'units-of-measure'
  | 'customers'
  | 'suppliers'
  | 'materials'

export interface MasterDataRecord {
  id: string
  code: string
  name: string
  active: boolean
  version: number
  createdAt: string
  updatedAt: string
  parentId?: string
  organizationId?: string
  factoryId?: string
  uomId?: string
  symbol?: string
  category?: string
  decimalScale?: number
  contactName?: string
  phone?: string
  email?: string
  address?: string
  materialType?: 'FABRIC' | 'ACCESSORY' | 'PACKAGING' | 'OTHER'
  specification?: string
  color?: string
  colorCode?: string
}

export interface MasterDataInput {
  code: string
  name: string
  parentId?: string
  organizationId?: string
  factoryId?: string
  uomId?: string
  symbol?: string
  category?: string
  decimalScale?: number
  contactName?: string
  phone?: string
  email?: string
  address?: string
  materialType?: MasterDataRecord['materialType']
  specification?: string
  color?: string
  colorCode?: string
  version?: number
}

export interface MasterDataPage {
  content: MasterDataRecord[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export interface MasterDataOption {
  id: string
  code: string
  name: string
}

export interface MasterDataQuery {
  page: number
  size: number
  active?: boolean
  query?: string
  sort?: string
}
