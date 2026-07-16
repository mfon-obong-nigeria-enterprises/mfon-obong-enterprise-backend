import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateProductDto,
  UpdateProductDto,
  UpdateStockDto,
  StockOperation,
  CreateVariantDto,
  UpdateVariantDto,
  UpdateVariantStockDto,
} from '../dto/product.dto';
import { CategoriesService } from '../../categories/services/categories.service';
import { UserRole } from '../../../common/enums';
import { SystemActivityLogService } from '../../system-activity-logs/services/system-activity-log.service';
import { RealtimeEventService } from '../../websocket/realtime-event.service';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CategoriesService,
    private readonly systemActivityLogService: SystemActivityLogService,
    private readonly realtimeEventService: RealtimeEventService,
  ) {}

  private transformProduct(product: any) {
    if (!product) return product;
    const { categoryRef, branchRef, ...rest } = product;
    return {
      ...rest,
      _id: product.id,
      categoryId: categoryRef
        ? { _id: categoryRef.id, ...categoryRef }
        : product.categoryId,
      branchId: branchRef
        ? { _id: branchRef.id, ...branchRef }
        : product.branchId,
    };
  }

  private readonly productInclude = {
    categoryRef: { select: { id: true, name: true, units: true } },
    branchRef: { select: { id: true, name: true } },
    variants: { where: { isActive: true }, orderBy: { name: 'asc' as const } },
  };

  async create(
    createProductDto: CreateProductDto,
    currentUser?: any,
    device?: string,
  ): Promise<any> {
    const branchId = createProductDto.branchId;

    let category: any;
    try {
      category = await this.categoriesService.findById(createProductDto.categoryId);
    } catch {
      throw new BadRequestException(
        `Invalid categoryId: ${createProductDto.categoryId}. Category does not exist.`,
      );
    }

    if (!category.units.includes(createProductDto.unit)) {
      throw new BadRequestException(
        `Invalid unit ${createProductDto.unit} for category ${category.name}`,
      );
    }

    const existingProduct = await this.prisma.product.findFirst({
      where: {
        name: createProductDto.name,
        branchId,
      },
    });

    if (existingProduct) {
      throw new BadRequestException(
        `A product named "${createProductDto.name}" already exists in this branch.`,
      );
    }

    const hasVariants = createProductDto.hasVariants ?? false;

    const product = await this.prisma.product.create({
      data: {
        name: createProductDto.name,
        categoryId: createProductDto.categoryId,
        unit: createProductDto.unit,
        unitPrice: hasVariants ? 0 : (createProductDto.unitPrice ?? 0),
        stock: hasVariants ? 0 : (createProductDto.stock ?? 0),
        minStockLevel: hasVariants ? 0 : (createProductDto.minStockLevel ?? 0),
        hasVariants,
        isBundleProduct: createProductDto.isBundleProduct ?? false,
        bundleSize: createProductDto.bundleSize ?? null,
        subUnit: createProductDto.subUnit ?? null,
        branchId,
        priceHistory: hasVariants ? [] : [{ price: createProductDto.unitPrice ?? 0, date: new Date() }],
        variants: hasVariants && createProductDto.variants?.length
          ? { create: createProductDto.variants.map(v => ({
              name: v.name,
              unitPrice: v.unitPrice,
              stock: v.stock,
              minStockLevel: v.minStockLevel,
            })) }
          : undefined,
      },
      include: this.productInclude,
    });

    try {
      this.systemActivityLogService.createLog({
        action: 'PRODUCT_CREATED',
        details: `Product created: ${product.name} (${product.unit}) in category ${category.name} - Price: ${product.unitPrice}`,
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
        branchId: currentUser?.branchId?.toString(),
      }).catch(() => {});
    } catch {}

    try {
      if (currentUser) {
        const eventData = this.realtimeEventService.createEventData(
          'created', 'product', product.id, product,
          { id: currentUser.id || currentUser._id || '', email: currentUser.email, role: currentUser.role, branchId: currentUser.branchId?.toString(), branch: currentUser.branch },
        );
        this.realtimeEventService.emitProductCreated(eventData);
      }
    } catch {}

    return this.transformProduct(product);
  }

  async findAll(currentUser?: any, includeInactive = false): Promise<any[]> {
    const where: any = includeInactive ? {} : { isActive: true };

    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      where.branchId = currentUser.branchId;
    }

    const products = await this.prisma.product.findMany({
      where,
      include: this.productInclude,
    });

    return products.map(p => this.transformProduct(p));
  }

  async findById(id: string, currentUser?: any): Promise<any> {
    const where: any = { id };

    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      where.branchId = currentUser.branchId;
    }

    const product = await this.prisma.product.findFirst({
      where,
      include: this.productInclude,
    });

    if (!product) throw new NotFoundException('Product not found');
    return this.transformProduct(product);
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    currentUser?: any,
    device?: string,
  ): Promise<any> {
    const existing = await this.findById(id, currentUser);

    if (updateProductDto.unit || updateProductDto.categoryId) {
      const categoryId = updateProductDto.categoryId || existing.categoryId?.id || existing.categoryId;
      const category = await this.categoriesService.findById(typeof categoryId === 'string' ? categoryId : categoryId?.id || categoryId);
      const unit = updateProductDto.unit || existing.unit;

      if (!category.units.includes(unit)) {
        throw new BadRequestException(`Invalid unit ${unit} for category ${category.name}`);
      }
    }

    const updateData: any = { ...updateProductDto };

    if (
      updateProductDto.unitPrice &&
      updateProductDto.unitPrice !== existing.unitPrice
    ) {
      const currentHistory = Array.isArray(existing.priceHistory) ? existing.priceHistory : [];
      updateData.priceHistory = [
        ...currentHistory,
        { price: updateProductDto.unitPrice, date: new Date() },
      ];
    }

    if (updateProductDto.branchId) {
      if (
        currentUser &&
        ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
      ) {
        delete updateData.branchId;
      }
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: updateData,
      include: this.productInclude,
    });

    try {
      const changes = Object.keys(updateProductDto).join(', ');
      this.systemActivityLogService.createLog({
        action: 'PRODUCT_UPDATED',
        details: `Product updated: ${product.name} - Changes: ${changes}`,
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
        branchId: currentUser?.branchId?.toString(),
      }).catch(() => {});
    } catch {}

    try {
      if (currentUser) {
        const eventData = this.realtimeEventService.createEventData(
          'updated', 'product', product.id, product,
          { id: currentUser.id || currentUser._id || '', email: currentUser.email, role: currentUser.role, branchId: currentUser.branchId?.toString(), branch: currentUser.branch },
        );
        this.realtimeEventService.emitProductUpdated(eventData);
      }
    } catch {}

    return this.transformProduct(product);
  }

  async updateStock(
    id: string,
    updateStockDto: UpdateStockDto,
    currentUser?: any,
    device?: string,
  ): Promise<any> {
    const where: any = { id };

    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      where.branchId = currentUser.branchId;
    }

    const product = await this.prisma.product.findFirst({ where });
    if (!product) throw new NotFoundException(`Product with ID ${id} not found`);

    const { quantity, unit, operation } = updateStockDto;

    if (product.unit !== unit) {
      throw new BadRequestException(
        `Unit mismatch: product has unit "${product.unit}", but operation specified "${unit}"`,
      );
    }

    if (operation === StockOperation.SUBTRACT && product.stock < quantity) {
      throw new BadRequestException(
        `Insufficient stock: current ${product.stock}, requested ${quantity}`,
      );
    }

    const newStock =
      operation === StockOperation.ADD
        ? product.stock + quantity
        : product.stock - quantity;

    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: { stock: newStock },
      include: this.productInclude,
    });

    try {
      this.systemActivityLogService.createLog({
        action: 'STOCK_UPDATED',
        details: `Stock ${operation === StockOperation.ADD ? 'increased' : 'decreased'} for ${updatedProduct.name}: ${quantity} ${unit} (New stock: ${newStock})`,
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
        branchId: currentUser?.branchId?.toString(),
      }).catch(() => {});
    } catch {}

    return this.transformProduct(updatedProduct);
  }

  async remove(id: string, currentUser?: any, device?: string): Promise<void> {
    const product = await this.findById(id, currentUser);

    await this.prisma.product.update({ where: { id }, data: { isActive: false } });

    try {
      this.systemActivityLogService.createLog({
        action: 'PRODUCT_DEACTIVATED',
        details: `Product deactivated: ${product.name} (${product.unit})`,
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
        branchId: currentUser?.branchId?.toString(),
      }).catch(() => {});
    } catch {}

    try {
      if (currentUser) {
        const eventData = this.realtimeEventService.createEventData(
          'deleted', 'product', id, product,
          { id: currentUser.id || currentUser._id || '', email: currentUser.email, role: currentUser.role, branchId: currentUser.branchId?.toString(), branch: currentUser.branch },
        );
        this.realtimeEventService.emitProductDeleted(eventData);
      }
    } catch {}
  }

  async hardRemove(id: string, currentUser?: any, device?: string): Promise<void> {
    const where: any = { id };

    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      where.branchId = currentUser.branchId;
    }

    try {
      const product = await this.prisma.product.delete({ where: { id } });
      try {
        this.systemActivityLogService.createLog({
          action: 'PRODUCT_DELETED',
          details: `Product permanently deleted: ${product.name} (${product.unit})`,
          performedBy: currentUser?.email || currentUser?.name || 'System',
          role: currentUser?.role || 'SYSTEM',
          device: device || 'System',
          branchId: currentUser?.branchId?.toString(),
        }).catch(() => {});
      } catch {}
    } catch (error) {
      if (error?.code === 'P2025') throw new NotFoundException('Product not found');
      throw error;
    }
  }

  async getLowStockProducts(currentUser?: any): Promise<any[]> {
    const where: any = { isActive: true };

    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      where.branchId = currentUser.branchId;
    }

    const products = await this.prisma.product.findMany({
      where,
      include: this.productInclude,
    });

    return products
      .filter(p => p.stock <= p.minStockLevel)
      .map(p => this.transformProduct(p));
  }

  async findByCategory(categoryId: string, currentUser?: any): Promise<any[]> {
    const where: any = { categoryId, isActive: true };

    if (
      currentUser &&
      ![UserRole.SUPER_ADMIN, UserRole.MAINTAINER].includes(currentUser.role)
    ) {
      where.branchId = currentUser.branchId;
    }

    const products = await this.prisma.product.findMany({
      where,
      include: this.productInclude,
    });

    return products.map(p => this.transformProduct(p));
  }

  async findByBranchId(branchId: string): Promise<any[]> {
    const products = await this.prisma.product.findMany({
      where: { branchId, isActive: true },
      include: this.productInclude,
      orderBy: { createdAt: 'desc' },
    });
    return products.map(p => this.transformProduct(p));
  }

  calculatePrice(product: any, quantity: number): number {
    return quantity * product.unitPrice;
  }

  async createVariant(productId: string, dto: CreateVariantDto, currentUser?: any): Promise<any> {
    const product = await this.prisma.product.findFirst({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    const variant = await this.prisma.productVariant.create({
      data: { productId, name: dto.name, unitPrice: dto.unitPrice, stock: dto.stock, minStockLevel: dto.minStockLevel },
    });

    if (!product.hasVariants) {
      await this.prisma.product.update({ where: { id: productId }, data: { hasVariants: true } });
    }

    return variant;
  }

  async updateVariant(variantId: string, dto: UpdateVariantDto, currentUser?: any): Promise<any> {
    const variant = await this.prisma.productVariant.findFirst({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Variant not found');
    return this.prisma.productVariant.update({ where: { id: variantId }, data: dto });
  }

  async deleteVariant(variantId: string, currentUser?: any): Promise<void> {
    const variant = await this.prisma.productVariant.findFirst({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Variant not found');
    await this.prisma.productVariant.update({ where: { id: variantId }, data: { isActive: false } });

    const remaining = await this.prisma.productVariant.count({ where: { productId: variant.productId, isActive: true } });
    if (remaining === 0) {
      await this.prisma.product.update({ where: { id: variant.productId }, data: { hasVariants: false } });
    }
  }

  async updateVariantStock(variantId: string, dto: UpdateVariantStockDto, currentUser?: any, device?: string): Promise<any> {
    const variant = await this.prisma.productVariant.findFirst({ where: { id: variantId, isActive: true } });
    if (!variant) throw new NotFoundException('Variant not found');

    if (dto.operation === 'subtract' && variant.stock < dto.quantity) {
      throw new BadRequestException(`Insufficient stock: current ${variant.stock}, requested ${dto.quantity}`);
    }

    const newStock = dto.operation === 'add' ? variant.stock + dto.quantity : variant.stock - dto.quantity;
    const updated = await this.prisma.productVariant.update({ where: { id: variantId }, data: { stock: newStock } });

    try {
      this.systemActivityLogService.createLog({
        action: 'STOCK_UPDATED',
        details: `Variant stock ${dto.operation === 'add' ? 'increased' : 'decreased'} for variant ${variant.name}: ${dto.quantity} units (New stock: ${newStock})`,
        performedBy: currentUser?.email || currentUser?.name || 'System',
        role: currentUser?.role || 'SYSTEM',
        device: device || 'System',
        branchId: currentUser?.branchId?.toString(),
      }).catch(() => {});
    } catch {}

    return updated;
  }

  async getVariantById(variantId: string): Promise<any> {
    const variant = await this.prisma.productVariant.findFirst({ where: { id: variantId, isActive: true } });
    if (!variant) throw new NotFoundException('Variant not found');
    return variant;
  }
}
