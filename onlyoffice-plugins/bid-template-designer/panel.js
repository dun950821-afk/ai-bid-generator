/* 标书模板设计器插件面板
 *
 * 在 OnlyOffice 编辑器内运行（window.Asc.plugin 由编辑器注入），
 * 点击变量即通过 InsertAndReplaceContentControls 在当前光标处
 * 一次成型地插入内容控件：
 *   Tag = bid.<type>:<key>（机器标识，编译器据此识别）
 *   Lock = 0（内容锁定、可整体删除）
 *
 * 变量数据来自 variables.js（由 backend/scripts/export_template_variables.py
 * 从 TemplateVariableRegistry 生成）。
 */
(function () {
  "use strict";

  var CONTROL_TYPE_LABELS = {
    slot: "插槽",
    image: "图片",
    material: "材料",
  };

  function insertControl(tag, alias, block) {
    // 单次调用 InsertAndReplaceContentControls 一次成型插入控件
    // （官方示例的标准用法）：Id 不存在 → 在光标处新建带内容的控件。
    // 不要拆成 AddContentControl + PasteText / 回调回填：
    // 前者向锁定控件粘贴会卡死编辑器，后者会残留占位符状态导致
    // 显示文本重复（占位符 + 正文两份）。
    var text = String(alias).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    var script =
      "var oParagraph = Api.CreateParagraph();" +
      "oParagraph.AddText('" + text + "');" +
      "Api.GetDocument().InsertContent([oParagraph]);";
    var doc = {
      Props: {
        Id: Math.floor(Math.random() * 2000000000) + 1,
        Tag: tag,
        Alias: alias,
        Lock: 0, // 0 = 内容锁定但可整体删除（防误改）
        Inline: !block,
        PlaceHolderText: alias,
      },
      Script: script,
    };
    window.Asc.plugin.executeMethod("InsertAndReplaceContentControls", [[doc]]);
  }

  function onVariableClick(variable) {
    var tag = variable.control_tag;

    if (variable.control_type === "material") {
      var usageKey = window.prompt(
        "请输入材料用途标识（英文小写，如 business_license）：",
        "business_license"
      );
      if (!usageKey) return;
      if (!/^[a-z][a-z0-9_]*$/.test(usageKey)) {
        window.alert("只能包含小写字母、数字和下划线，且以字母开头");
        return;
      }
      tag = "bid.material:" + usageKey;
    }

    insertControl(tag, variable.name, variable.control_type === "slot");
  }

  function render(groups, keyword) {
    var container = document.getElementById("groups");
    container.innerHTML = "";
    var shown = 0;

    groups.forEach(function (group) {
      var variables = group.variables.filter(function (v) {
        if (!keyword) return true;
        var hay = (v.name + " " + v.key + " " + (v.description || "")).toLowerCase();
        return hay.indexOf(keyword) >= 0;
      });
      if (!variables.length) return;
      shown += variables.length;

      var groupEl = document.createElement("div");
      groupEl.className = "group";

      var titleEl = document.createElement("div");
      titleEl.className = "group-title";
      titleEl.textContent = group.category_name + "（" + variables.length + "）";
      titleEl.onclick = function () {
        groupEl.classList.toggle("collapsed");
      };
      groupEl.appendChild(titleEl);

      var itemsEl = document.createElement("div");
      itemsEl.className = "group-items";

      variables.forEach(function (v) {
        var item = document.createElement("div");
        item.className = "item";

        // 变量元数据一律走 DOM API + textContent，避免 innerHTML 注入
        var nameEl = document.createElement("div");
        nameEl.className = "name";
        nameEl.textContent = v.name;
        if (v.required) {
          var requiredTag = document.createElement("span");
          requiredTag.className = "tag required";
          requiredTag.textContent = "必填";
          nameEl.appendChild(requiredTag);
        }
        if (v.control_type !== "var") {
          var typeTag = document.createElement("span");
          typeTag.className = "tag special";
          typeTag.textContent = CONTROL_TYPE_LABELS[v.control_type] || v.control_type;
          nameEl.appendChild(typeTag);
        }
        item.appendChild(nameEl);

        var descEl = document.createElement("div");
        descEl.className = "desc";
        descEl.textContent = v.description || v.source || "";
        item.appendChild(descEl);

        item.onclick = function () {
          onVariableClick(v);
        };
        itemsEl.appendChild(item);
      });

      groupEl.appendChild(itemsEl);
      container.appendChild(groupEl);
    });

    if (!shown) {
      container.innerHTML = '<div class="empty">没有匹配的变量</div>';
    }
  }

  function start() {
    var groups = (window.BID_TEMPLATE_VARIABLES || {}).groups || [];

    window.Asc.plugin.init = function () {
      render(groups, "");
      document.getElementById("search").addEventListener("input", function (e) {
        render(groups, e.target.value.trim().toLowerCase());
      });
    };

    window.Asc.plugin.button = function (id) {
      if (id === -1) {
        window.Asc.plugin.executeCommand("close", "");
      }
    };
  }

  // 防御：plugins.js 未加载/未执行时等待重试，超时给出可见诊断
  // （而不是控制台里一行 Uncaught TypeError）
  var waited = 0;
  function waitForAsc() {
    if (window.Asc && window.Asc.plugin) {
      start();
      return;
    }
    waited += 100;
    if (waited >= 5000) {
      var container = document.getElementById("groups");
      container.innerHTML =
        '<div class="empty">插件初始化失败：<br>未检测到编辑器插件接口（window.Asc）。' +
        "<br>请强刷页面（Ctrl+Shift+R）后重试。</div>";
      return;
    }
    setTimeout(waitForAsc, 100);
  }
  waitForAsc();
})();
