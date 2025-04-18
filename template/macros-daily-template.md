## 🥗 Macros for <% tp.date.now("YYYY-MM-DD") %>

```macros
id: <% tp.date.now("YYYY-MM-DD") %>
```

## 📊 Pie Chart

### Todays Macros:

```macrospc
id: <% tp.date.now("YYYY-MM-DD") %>
```

### 📅 Weekly Overview:

```macroscalc
ids: <%* 
let days = [];
for (let x = 6; x >= 0; x--) {
  days.push(tp.date.now("YYYY-MM-DD", -x));
}
tR += days.join(", ");
%>
```

```macrospc
ids: <%* 
let dayspc = [];
for (let i = 6; i >= 0; i--) {
  dayspc.push(tp.date.now("YYYY-MM-DD", -i));
}
tR += dayspc.join(", ");
%>
```