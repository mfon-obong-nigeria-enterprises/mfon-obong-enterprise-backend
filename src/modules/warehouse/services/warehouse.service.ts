import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateWarehouseDto,
  UpdateWarehouseDto,
  CreateWarehouseProductDto,
  UpdateWarehouseProductDto,
  AddWarehouseStockDto,
  CreateWarehouseVariantDto,
  UpdateWarehouseVariantDto,
  StockTransferDto,
} from '../dto/warehouse.dto';

@Injectable()
export class WarehouseService {
  constructor(private readonly prisma: PrismaService) {}

  private toDoc(record: any) {
    if (!record) return record;
    return { ...record, _id: record.id };
  }

  // ── Warehouses ──────────────────────────────────────────────────────────────

  async createWarehouse(dto: CreateWarehouseDto): Promise<any> {
    const existing = await this.prisma.warehouse.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('A warehouse with this name already exists');

    const warehouse = await this.prisma.warehouse.create({ data: dto });
    return this.toDoc(warehouse);
  }

  async findAllWarehouses(): Promise<any[]> {
    const warehouses = await this.prisma.warehouse.findMany({
      where: { isActive: true },
      include: { _count: { select: { products: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return warehouses.map(w => this.toDoc(w));
  }

  async findWarehouseById(id: string): Promise<any> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        products: {
          where: { isActive: true },
          include: {
            categoryRef: { select: { id: true, name: true } },
            variants: { where: { isActive: true }, orderBy: { name: 'asc' } },
          },
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    const result = this.toDoc(warehouse);
    result.products = warehouse.products.map(p => ({
      ...this.toDoc(p),
      categoryRef: p.categoryRef,
      variants: p.variants.map(v => this.toDoc(v)),
    }));
    return result;
  }

  async updateWarehouse(id: string, dto: UpdateWarehouseDto): Promise<any> {
    await this.findWarehouseById(id);
    const warehouse = await this.prisma.warehouse.update({ where: { id }, data: dto });
    return this.toDoc(warehouse);
  }

  // ── Warehouse Products ───────────────────────────────────────────────────────

  async createWarehouseProduct(warehouseId: string, dto: CreateWarehouseProductDto): Promise<any> {
    await this.findWarehouseById(warehouseId);

    const category = await this.prisma.category.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new BadRequestException('Category not found');

    if (!category.units.includes(dto.unit)) {
      throw new BadRequestException(`Unit "${dto.unit}" is not valid for category "${category.name}"`);
    }

    const existing = await this.prisma.warehouseProduct.findUnique({
      where: { name_warehouseId: { name: dto.name, warehouseId } },
    });
    if (existing) throw new ConflictException('A product with this name already exists in this warehouse');

    const product = await this.prisma.warehouseProduct.create({
      data: {
        warehouseId,
        categoryId: dto.categoryId,
        name: dto.name,
        unit: dto.unit,
        hasVariants: dto.hasVariants ?? false,
        stock: dto.hasVariants ? 0 : (dto.stock ?? 0),
      },
      include: {
        categoryRef: { select: { id: true, name: true } },
        variants: true,
      },
    });
    return this.toDoc(product);
  }

  async findAllWarehouseProducts(warehouseId?: string, categoryId?: string): Promise<any[]> {
    const where: any = { isActive: true };
    if (warehouseId) where.warehouseId = warehouseId;
    if (categoryId) where.categoryId = categoryId;

    const products = await this.prisma.warehouseProduct.findMany({
      where,
      include: {
        categoryRef: { select: { id: true, name: true } },
        variants: { where: { isActive: true }, orderBy: { name: 'asc' } },
        warehouseRef: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
    return products.map(p => {
      const result = this.toDoc(p);
      result.variants = p.variants.map((v: any) => this.toDoc(v));
      return result;
    });
  }

  async findWarehouseProductById(id: string): Promise<any> {
    const product = await this.prisma.warehouseProduct.findUnique({
      where: { id },
      include: {
        categoryRef: { select: { id: true, name: true } },
        variants: { where: { isActive: true }, orderBy: { name: 'asc' } },
        warehouseRef: { select: { id: true, name: true } },
      },
    });
    if (!product) throw new NotFoundException('Warehouse product not found');
    const result = this.toDoc(product);
    result.variants = product.variants.map(v => this.toDoc(v));
    return result;
  }

  async updateWarehouseProduct(id: string, dto: UpdateWarehouseProductDto): Promise<any> {
    const existing = await this.findWarehouseProductById(id);
    const nameChanged = dto.name !== undefined && dto.name !== existing.name;

    if (nameChanged) {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.warehouseProduct.update({
          where: { id },
          data: dto,
          include: {
            categoryRef: { select: { id: true, name: true } },
            variants: { where: { isActive: true }, orderBy: { name: 'asc' } },
          },
        });
        await tx.product.updateMany({
          where: { warehouseProductId: id },
          data: { name: dto.name },
        });
        return this.toDoc(updated);
      });
    }

    const product = await this.prisma.warehouseProduct.update({
      where: { id },
      data: dto,
      include: {
        categoryRef: { select: { id: true, name: true } },
        variants: { where: { isActive: true }, orderBy: { name: 'asc' } },
      },
    });
    return this.toDoc(product);
  }

  async addWarehouseStock(id: string, dto: AddWarehouseStockDto): Promise<any> {
    const product = await this.findWarehouseProductById(id);
    if (product.hasVariants) {
      throw new BadRequestException('Use variant stock endpoints for variant products');
    }
    const updated = await this.prisma.warehouseProduct.update({
      where: { id },
      data: { stock: { increment: dto.quantity } },
      include: {
        categoryRef: { select: { id: true, name: true } },
        variants: true,
      },
    });
    return this.toDoc(updated);
  }

  // ── Warehouse Variants ───────────────────────────────────────────────────────

  async createWarehouseVariant(warehouseProductId: string, dto: CreateWarehouseVariantDto): Promise<any> {
    const product = await this.findWarehouseProductById(warehouseProductId);
    if (!product.hasVariants) throw new BadRequestException('This product does not support variants');

    const existing = await this.prisma.warehouseProductVariant.findUnique({
      where: { name_warehouseProductId: { name: dto.name, warehouseProductId } },
    });
    if (existing) throw new ConflictException('A variant with this name already exists');

    const variant = await this.prisma.warehouseProductVariant.create({
      data: { warehouseProductId, name: dto.name, stock: dto.stock ?? 0 },
    });
    return this.toDoc(variant);
  }

  async updateWarehouseVariant(variantId: string, dto: UpdateWarehouseVariantDto): Promise<any> {
    const existing = await this.prisma.warehouseProductVariant.findUnique({ where: { id: variantId } });
    if (!existing) throw new NotFoundException('Warehouse variant not found');

    const nameChanged = dto.name !== undefined && dto.name !== existing.name;

    if (nameChanged) {
      return await this.prisma.$transaction(async (tx) => {
        const variant = await tx.warehouseProductVariant.update({ where: { id: variantId }, data: dto });
        await tx.productVariant.updateMany({
          where: { warehouseProductVariantId: variantId },
          data: { name: dto.name },
        });
        return this.toDoc(variant);
      });
    }

    const variant = await this.prisma.warehouseProductVariant.update({ where: { id: variantId }, data: dto });
    return this.toDoc(variant);
  }

  async addWarehouseVariantStock(variantId: string, dto: AddWarehouseStockDto): Promise<any> {
    const existing = await this.prisma.warehouseProductVariant.findUnique({ where: { id: variantId } });
    if (!existing) throw new NotFoundException('Warehouse variant not found');
    const variant = await this.prisma.warehouseProductVariant.update({
      where: { id: variantId },
      data: { stock: { increment: dto.quantity } },
    });
    return this.toDoc(variant);
  }

  // ── Stock Transfers ──────────────────────────────────────────────────────────

  async transferToBlanche(dto: StockTransferDto, currentUser: any): Promise<any> {
    const warehouseProduct = await this.prisma.warehouseProduct.findUnique({
      where: { id: dto.warehouseProductId },
      include: { variants: true },
    });
    if (!warehouseProduct) throw new NotFoundException('Warehouse product not found');

    if (dto.warehouseProductVariantId) {
      // Variant transfer
      const variant = warehouseProduct.variants.find(v => v.id === dto.warehouseProductVariantId);
      if (!variant) throw new NotFoundException('Warehouse variant not found');

      if (variant.stock < dto.quantity) {
        throw new BadRequestException(
          `Insufficient warehouse stock. Available: ${variant.stock} ${warehouseProduct.unit}, Requested: ${dto.quantity} ${warehouseProduct.unit}`,
        );
      }

      return await this.prisma.$transaction(async (tx) => {
        const updatedVariant = await tx.warehouseProductVariant.update({
          where: { id: dto.warehouseProductVariantId },
          data: { stock: { decrement: dto.quantity } },
        });

        // Also increment the linked branch variant stock
        const branchVariant = await tx.productVariant.findFirst({
          where: {
            warehouseProductVariantId: dto.warehouseProductVariantId,
            productRef: { branchId: dto.branchId },
          },
        });
        if (branchVariant) {
          await tx.productVariant.update({
            where: { id: branchVariant.id },
            data: { stock: { increment: dto.quantity } },
          });
        }

        const transfer = await tx.stockTransfer.create({
          data: {
            warehouseId: dto.warehouseId,
            branchId: dto.branchId,
            warehouseProductId: dto.warehouseProductId,
            warehouseProductVariantId: dto.warehouseProductVariantId,
            quantity: dto.quantity,
            performedById: currentUser.id || currentUser._id,
            notes: dto.notes,
          },
        });

        return { transfer: this.toDoc(transfer), updatedVariant: this.toDoc(updatedVariant) };
      });
    } else {
      // Simple product transfer
      if (warehouseProduct.hasVariants) {
        throw new BadRequestException('This product has variants — specify a variant for transfer');
      }

      if (warehouseProduct.stock < dto.quantity) {
        throw new BadRequestException(
          `Insufficient warehouse stock. Available: ${warehouseProduct.stock} ${warehouseProduct.unit}, Requested: ${dto.quantity} ${warehouseProduct.unit}`,
        );
      }

      return await this.prisma.$transaction(async (tx) => {
        const updatedProduct = await tx.warehouseProduct.update({
          where: { id: dto.warehouseProductId },
          data: { stock: { decrement: dto.quantity } },
        });

        // Also increment the linked branch product stock
        const branchProduct = await tx.product.findFirst({
          where: {
            warehouseProductId: dto.warehouseProductId,
            branchId: dto.branchId,
          },
        });
        if (branchProduct) {
          await tx.product.update({
            where: { id: branchProduct.id },
            data: { stock: { increment: dto.quantity } },
          });
        }

        const transfer = await tx.stockTransfer.create({
          data: {
            warehouseId: dto.warehouseId,
            branchId: dto.branchId,
            warehouseProductId: dto.warehouseProductId,
            quantity: dto.quantity,
            performedById: currentUser.id || currentUser._id,
            notes: dto.notes,
          },
        });

        return { transfer: this.toDoc(transfer), updatedProduct: this.toDoc(updatedProduct) };
      });
    }
  }

  async runInitialCleanup(): Promise<{ message: string; counts: Record<string, number> }> {
    const ec  = await this.prisma.extraCharge.deleteMany();
    const ti  = await this.prisma.transactionItem.deleteMany();
    const tx  = await this.prisma.transaction.deleteMany();
    await this.prisma.counter.updateMany({ where: { name: 'invoice' }, data: { value: 0 } });
    const pv  = await this.prisma.productVariant.deleteMany();
    const pr  = await this.prisma.product.deleteMany();
    const st  = await this.prisma.stockTransfer.deleteMany();
    const wv  = await this.prisma.warehouseProductVariant.deleteMany();
    const wp  = await this.prisma.warehouseProduct.deleteMany();
    const wh  = await this.prisma.warehouse.deleteMany();
    const cat = await this.prisma.category.deleteMany();

    return {
      message: 'Cleanup complete. Branches and users untouched.',
      counts: {
        extraCharges: ec.count,
        transactionItems: ti.count,
        transactions: tx.count,
        productVariants: pv.count,
        products: pr.count,
        stockTransfers: st.count,
        warehouseProductVariants: wv.count,
        warehouseProducts: wp.count,
        warehouses: wh.count,
        categories: cat.count,
      },
    };
  }

  async getTransferHistory(warehouseId?: string, branchId?: string): Promise<any[]> {
    const where: any = {};
    if (warehouseId) where.warehouseId = warehouseId;
    if (branchId) where.branchId = branchId;

    const transfers = await this.prisma.stockTransfer.findMany({
      where,
      include: {
        warehouseRef: { select: { id: true, name: true } },
        warehouseProductRef: { select: { id: true, name: true, unit: true } },
        warehouseProductVariantRef: { select: { id: true, name: true } },
        performedByRef: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return transfers.map(t => this.toDoc(t));
  }
}
