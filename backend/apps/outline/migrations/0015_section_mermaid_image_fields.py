# Generated for P3 Mermaid + AI image fields

from django.db import migrations, models


class Migration(migrations.Migration):
    """章节 Mermaid 配图与 AI 生图字段（P3 正文增强）。"""

    dependencies = [
        ("outline", "0014_outline_review_overridden"),
    ]

    operations = [
        migrations.AddField(
            model_name="section",
            name="mermaid_code",
            field=models.TextField(
                blank=True,
                default="",
                help_text="Mermaid 配图代码，渲染成功后存入",
                verbose_name="Mermaid 代码",
            ),
        ),
        migrations.AddField(
            model_name="section",
            name="mermaid_object_key",
            field=models.CharField(
                blank=True,
                default="",
                help_text="MinIO 中渲染后的 PNG 对象键",
                max_length=500,
                verbose_name="Mermaid 图片对象键",
            ),
        ),
        migrations.AddField(
            model_name="section",
            name="image_prompt",
            field=models.TextField(
                blank=True,
                default="",
                help_text="AI 生图 prompt，未配置生图模型时存此字段供手动生图",
                verbose_name="生图提示词",
            ),
        ),
        migrations.AddField(
            model_name="section",
            name="image_object_key",
            field=models.CharField(
                blank=True,
                default="",
                help_text="MinIO 中生成的图片对象键",
                max_length=500,
                verbose_name="生图对象键",
            ),
        ),
    ]
