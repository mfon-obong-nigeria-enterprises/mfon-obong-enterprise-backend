import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WarehouseService } from '../services/warehouse.service';
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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from 'src/decorators/roles.decorators';
import { UserRole } from '../../../common/enums';

@Controller('warehouse')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  // ── Warehouses ──────────────────────────────────────────────────────────────

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateWarehouseDto) {
    return this.warehouseService.createWarehouse(dto);
  }

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAINTAINER)
  findAll() {
    return this.warehouseService.findAllWarehouses();
  }

  @Get('products')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAINTAINER)
  findAllProducts(
    @Query('warehouseId') warehouseId?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.warehouseService.findAllWarehouseProducts(warehouseId, categoryId);
  }

  @Get('transfers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAINTAINER)
  getTransfers(
    @Query('warehouseId') warehouseId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.warehouseService.getTransferHistory(warehouseId, branchId);
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAINTAINER)
  findOne(@Param('id') id: string) {
    return this.warehouseService.findWarehouseById(id);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehouseService.updateWarehouse(id, dto);
  }

  // ── Warehouse Products ───────────────────────────────────────────────────────

  @Post(':id/products')
  @Roles(UserRole.SUPER_ADMIN)
  createProduct(@Param('id') warehouseId: string, @Body() dto: CreateWarehouseProductDto) {
    return this.warehouseService.createWarehouseProduct(warehouseId, dto);
  }

  @Get('products/:productId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAINTAINER)
  findProduct(@Param('productId') productId: string) {
    return this.warehouseService.findWarehouseProductById(productId);
  }

  @Patch('products/:productId')
  @Roles(UserRole.SUPER_ADMIN)
  updateProduct(@Param('productId') productId: string, @Body() dto: UpdateWarehouseProductDto) {
    return this.warehouseService.updateWarehouseProduct(productId, dto);
  }

  @Patch('products/:productId/stock')
  @Roles(UserRole.SUPER_ADMIN)
  addStock(@Param('productId') productId: string, @Body() dto: AddWarehouseStockDto) {
    return this.warehouseService.addWarehouseStock(productId, dto);
  }

  // ── Warehouse Variants ───────────────────────────────────────────────────────

  @Post('products/:productId/variants')
  @Roles(UserRole.SUPER_ADMIN)
  createVariant(@Param('productId') productId: string, @Body() dto: CreateWarehouseVariantDto) {
    return this.warehouseService.createWarehouseVariant(productId, dto);
  }

  @Patch('variants/:variantId')
  @Roles(UserRole.SUPER_ADMIN)
  updateVariant(@Param('variantId') variantId: string, @Body() dto: UpdateWarehouseVariantDto) {
    return this.warehouseService.updateWarehouseVariant(variantId, dto);
  }

  @Patch('variants/:variantId/stock')
  @Roles(UserRole.SUPER_ADMIN)
  addVariantStock(@Param('variantId') variantId: string, @Body() dto: AddWarehouseStockDto) {
    return this.warehouseService.addWarehouseVariantStock(variantId, dto);
  }

  // ── Stock Transfers ──────────────────────────────────────────────────────────

  @Post('transfer')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MAINTAINER)
  transfer(@Body() dto: StockTransferDto, @Request() req) {
    return this.warehouseService.transferToBlanche(dto, req.user);
  }

  // ── One-time migration cleanup ───────────────────────────────────────────────

  @Post('admin/initial-cleanup')
  @Roles(UserRole.MAINTAINER)
  runCleanup() {
    return this.warehouseService.runInitialCleanup();
  }
}
