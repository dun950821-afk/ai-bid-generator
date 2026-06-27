# backend/apps/enterprise/views/package_views.py
"""标书材料包视图。"""

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.enterprise.constants import MaterialStatus, MaterialType, PackageStatus
from apps.enterprise.models import (
    BidMaterialPackage,
    BidMaterialPackageItem,
    CompanyMaterial,
    CompanyProfile,
)
from apps.enterprise.permissions import CanManageMaterialPackage
from apps.enterprise.serializers import (
    BidMaterialPackageBriefSerializer,
    BidMaterialPackageCreateSerializer,
    BidMaterialPackageSerializer,
    BidMaterialPackageUpdateSerializer,
    MaterialCheckResultSerializer,
)
from apps.outline.models import Outline


def _auto_fill_materials(package, company):
    """根据公司现有有效材料自动填充材料包明细。"""
    materials = CompanyMaterial.objects.filter(
        company=company,
        status=MaterialStatus.ACTIVE,
    )

    type_materials = {}
    for material in materials:
        if material.material_type not in type_materials:
            type_materials[material.material_type] = material

    items = []
    display_order = 0
    for material_type, material in type_materials.items():
        items.append(
            BidMaterialPackageItem(
                package=package,
                material=material,
                usage_key=material_type,
                display_order=display_order,
                required=False,
            )
        )
        display_order += 1

    BidMaterialPackageItem.objects.bulk_create(items)


class BidMaterialPackageViewSet(viewsets.ModelViewSet):
    """标书材料包视图集。

    材料包通过 outline_id 关联，URL 格式：
    /api/enterprise/outlines/{outline_id}/material-package/
    """

    serializer_class = BidMaterialPackageSerializer
    lookup_field = "outline_id"
    permission_classes = [CanManageMaterialPackage]

    def get_outline(self):
        """获取关联的大纲。"""
        outline_id = self.kwargs.get("outline_id")
        return get_object_or_404(Outline, pk=outline_id)

    def get_queryset(self):
        """获取材料包。"""
        return BidMaterialPackage.objects.select_related(
            "outline", "company", "created_by"
        ).prefetch_related("items__material")

    def get_object(self):
        """获取当前大纲的材料包。"""
        outline = self.get_outline()
        package = getattr(outline, "material_package", None)
        if not package:
            from rest_framework.exceptions import Http404
            raise Http404("材料包不存在")
        return package

    def list(self, request, outline_id=None):
        """获取材料包（每个大纲只有一个）。"""
        outline = self.get_outline()
        package = getattr(outline, "material_package", None)

        if not package:
            return Response(
                {"detail": "材料包不存在"},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = self.get_serializer(package)
        return Response(serializer.data)

    def create(self, request, outline_id=None):
        """创建材料包。"""
        outline = self.get_outline()

        # 检查是否已存在
        if hasattr(outline, "material_package"):
            return Response(
                {"detail": "材料包已存在"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = BidMaterialPackageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        company_id = serializer.validated_data["company_id"]
        name = serializer.validated_data.get("name", "")
        auto_fill = serializer.validated_data.get("auto_fill", True)

        company = get_object_or_404(CompanyProfile, pk=company_id)

        with transaction.atomic():
            # 创建材料包
            package = BidMaterialPackage.objects.create(
                outline=outline,
                company=company,
                name=name or f"{outline.name} 材料包",
                company_snapshot=company.to_snapshot(),
                created_by=request.user,
            )

            # 自动填充推荐材料
            if auto_fill:
                _auto_fill_materials(package, company)

        return Response(
            BidMaterialPackageSerializer(package).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, outline_id=None):
        """更新材料包。"""
        package = self.get_object()

        if not package.is_editable():
            return Response(
                {"detail": "材料包已锁定，无法修改"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = BidMaterialPackageUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            # 更新名称
            if "name" in serializer.validated_data:
                package.name = serializer.validated_data["name"]
                package.save(update_fields=["name"])

            # 更新材料明细
            if "items" in serializer.validated_data:
                # 删除现有明细
                package.items.all().delete()

                # 创建新明细
                items_data = serializer.validated_data["items"]
                items = []
                for i, item_data in enumerate(items_data):
                    material = get_object_or_404(
                        CompanyMaterial, pk=item_data["material_id"]
                    )
                    items.append(
                        BidMaterialPackageItem(
                            package=package,
                            material=material,
                            usage_key=item_data.get("usage_key", material.material_type),
                            display_order=i,
                            required=item_data.get("required", False),
                            notes=item_data.get("notes", ""),
                        )
                    )

                BidMaterialPackageItem.objects.bulk_create(items)

        return Response(BidMaterialPackageSerializer(package).data)

    @action(detail=True, methods=["post"])
    def lock(self, request, outline_id=None):
        """锁定材料包。"""
        package = self.get_object()

        if package.status == PackageStatus.LOCKED:
            return Response({"detail": "材料包已锁定"})

        package.lock()
        return Response(BidMaterialPackageSerializer(package).data)

    @action(detail=False, methods=["get"])
    def check(self, request, outline_id=None):
        """检查材料完整性。"""
        outline = self.get_outline()
        package = getattr(outline, "material_package", None)

        if not package:
            return Response(
                {
                    "pass_status": False,
                    "missing_materials": [],
                    "expired_materials": [],
                    "warnings": [{"type": "no_package", "message": "材料包未创建"}],
                }
            )

        # 获取所有章节的材料需求
        from apps.outline.models import Section

        sections = Section.objects.filter(outline=outline).exclude(content_matrix={})
        required_materials = []

        for section in sections:
            matrix = section.content_matrix or {}
            section_materials = matrix.get("required_materials", [])
            for mat in section_materials:
                required_materials.append({
                    "section_id": section.id,
                    "section_title": section.title,
                    **mat,
                })

        # 检查每个需求
        missing_materials = []
        expired_materials = []
        warnings = []

        for req in required_materials:
            usage_key = req.get("usage_key")
            material_type = req.get("material_type")
            required = req.get("required", True)

            # 查找材料包中的对应材料
            item = package.items.filter(usage_key=usage_key).first()

            if not item:
                if required:
                    missing_materials.append({
                        "section_id": req.get("section_id"),
                        "section_title": req.get("section_title"),
                        "usage_key": usage_key,
                        "material_type": material_type,
                        "description": req.get("description", ""),
                    })
            elif item.material.is_expired:
                expired_materials.append({
                    "material_id": item.material.id,
                    "title": item.material.title,
                    "material_type": item.material.material_type,
                    "valid_to": item.material.valid_to.isoformat() if item.material.valid_to else None,
                    "days_expired": abs(item.material.days_to_expire or 0),
                })

        pass_status = len(missing_materials) == 0 and len(expired_materials) == 0

        return Response({
            "pass_status": pass_status,
            "missing_materials": missing_materials,
            "expired_materials": expired_materials,
            "warnings": warnings,
        })

    @action(detail=False, methods=["post"])
    def auto_fill(self, request, outline_id=None):
        """自动推荐并填充材料。"""
        outline = self.get_outline()
        package = getattr(outline, "material_package", None)

        if not package:
            return Response(
                {"detail": "材料包未创建"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not package.is_editable():
            return Response(
                {"detail": "材料包已锁定，无法修改"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 获取所有章节的材料需求
        from apps.outline.models import Section

        sections = Section.objects.filter(outline=outline).exclude(content_matrix={})
        required_types = set()

        for section in sections:
            matrix = section.content_matrix or {}
            section_materials = matrix.get("required_materials", [])
            for mat in section_materials:
                required_types.add(mat.get("material_type"))

        # 查找公司对应类型的最新材料
        existing_usage_keys = set(
            package.items.values_list("usage_key", flat=True)
        )

        materials = CompanyMaterial.objects.filter(
            company=package.company,
            material_type__in=required_types,
            status=MaterialStatus.ACTIVE,
        ).exclude(
            material_type__in=existing_usage_keys
        ).order_by("-created_at")

        # 按类型取最新的
        type_materials = {}
        for material in materials:
            if material.material_type not in type_materials:
                type_materials[material.material_type] = material

        # 创建新材料包明细
        items = []
        max_order = max(
            package.items.values_list("display_order", flat=True).first() or 0,
            0,
        )

        for material_type, material in type_materials.items():
            max_order += 1
            items.append(
                BidMaterialPackageItem(
                    package=package,
                    material=material,
                    usage_key=material_type,
                    display_order=max_order,
                    required=True,
                )
            )

        if items:
            BidMaterialPackageItem.objects.bulk_create(items)

        return Response(BidMaterialPackageSerializer(package).data)


class BidMaterialPackageTopLevelViewSet(viewsets.ModelViewSet):
    """标书材料包顶层视图集。

    暴露在 `/api/enterprise/material-packages/` 下，支持标准 CRUD，
    不依赖 outline_id。可通过 `outline` 查询参数过滤。
    """

    serializer_class = BidMaterialPackageSerializer
    permission_classes = [CanManageMaterialPackage]
    lookup_field = "pk"

    def get_queryset(self):
        """返回材料包列表，支持按 outline/company/status 过滤。"""
        queryset = BidMaterialPackage.objects.select_related(
            "outline", "company", "created_by"
        ).prefetch_related("items__material")

        outline_id = self.request.query_params.get("outline")
        if outline_id:
            queryset = queryset.filter(outline_id=outline_id)

        company_id = self.request.query_params.get("company")
        if company_id:
            queryset = queryset.filter(company_id=company_id)

        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        return queryset

    def create(self, request, *args, **kwargs):
        """创建材料包（顶层入口，需显式指定 outline_id）。"""
        serializer = BidMaterialPackageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        outline_id = request.data.get("outline_id")
        if not outline_id:
            return Response(
                {"detail": "outline_id 为必填项"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        outline = get_object_or_404(Outline, pk=outline_id)

        if hasattr(outline, "material_package"):
            return Response(
                {"detail": "材料包已存在"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        company_id = serializer.validated_data["company_id"]
        name = serializer.validated_data.get("name", "")
        auto_fill = serializer.validated_data.get("auto_fill", True)

        company = get_object_or_404(CompanyProfile, pk=company_id)

        with transaction.atomic():
            package = BidMaterialPackage.objects.create(
                outline=outline,
                company=company,
                name=name or f"{outline.name} 材料包",
                company_snapshot=company.to_snapshot(),
                created_by=request.user,
            )

            if auto_fill:
                _auto_fill_materials(package, company)

        return Response(
            BidMaterialPackageSerializer(package).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        """更新材料包。"""
        package = self.get_object()

        if not package.is_editable():
            return Response(
                {"detail": "材料包已锁定，无法修改"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = BidMaterialPackageUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            if "name" in serializer.validated_data:
                package.name = serializer.validated_data["name"]
                package.save(update_fields=["name"])

            if "items" in serializer.validated_data:
                package.items.all().delete()
                items_data = serializer.validated_data["items"]
                items = []
                for i, item_data in enumerate(items_data):
                    material = get_object_or_404(
                        CompanyMaterial, pk=item_data["material_id"]
                    )
                    items.append(
                        BidMaterialPackageItem(
                            package=package,
                            material=material,
                            usage_key=item_data.get("usage_key", material.material_type),
                            display_order=i,
                            required=item_data.get("required", False),
                            notes=item_data.get("notes", ""),
                        )
                    )
                BidMaterialPackageItem.objects.bulk_create(items)

        return Response(BidMaterialPackageSerializer(package).data)

    def partial_update(self, request, *args, **kwargs):
        """部分更新（PATCH），复用 update 逻辑。"""
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """删除材料包。"""
        package = self.get_object()
        package.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
