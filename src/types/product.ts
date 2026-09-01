export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE'
export type BomStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'ACTIVE' | 'RETIRED'

export interface Product {
  id: string
  styleNo: string
  name: string
  brand?: string
  series?: string
  category?: string
  season?: string
  targetPrice?: number
  fit?: string
  status: ProductStatus
  version: number
  createdAt: string
  updatedAt: string
}

export interface ProductPage {
  content: Product[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}

export interface ProductInput {
  styleNo: string
  name: string
  brand?: string
  series?: string
  category?: string
  season?: string
  targetPrice?: number
  fit?: string
  version?: number
}

export interface Sku {
  id: string
  productId: string
  skuCode: string
  color: string
  colorCode: string
  size: string
  fit: string
  active: boolean
  version: number
  createdAt: string
  updatedAt: string
}

export interface SkuInput {
  skuCode: string
  color: string
  colorCode: string
  size: string
  fit?: string
  version?: number
}

export interface BomItem {
  id: string
  materialId: string
  materialType: 'FABRIC' | 'ACCESSORY' | 'PACKAGING'
  materialCode: string
  materialName: string
  usage: number
  lossRate: number
  uom: string
  specification?: string
  version: number
}

export interface BomVersion {
  id: string
  productId: string
  versionNo: string
  name: string
  status: BomStatus
  version: number
  submittedAt?: string
  approvedAt?: string
  activatedAt?: string
  retiredAt?: string
  createdAt: string
  updatedAt: string
  items: BomItem[]
}

export type BomSummary = Omit<BomVersion, 'items'>
export interface BomPage {
  content: BomSummary[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}

export interface BomInput {
  productId: string
  versionNo: string
  name: string
  items: Array<{ materialId: string; usage: number; lossRate: number }>
  version?: number
}
