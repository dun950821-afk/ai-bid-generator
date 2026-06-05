# Generated migration for adding object_key to BidDocument

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('outline', '0005_add_bid_document'),
    ]

    operations = [
        migrations.AddField(
            model_name='biddocument',
            name='object_key',
            field=models.CharField(blank=True, help_text='MinIO 中的对象路径', max_length=500, verbose_name='MinIO 对象键'),
        ),
        migrations.AlterField(
            model_name='biddocument',
            name='docx_file',
            field=models.FileField(blank=True, null=True, upload_to='bid_documents/%Y/%m/%d/', verbose_name='Word 文件'),
        ),
    ]
