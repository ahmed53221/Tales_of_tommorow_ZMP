/*
 * Generating a line graph of multiple parties with multiple dates
 * - Full integration with Class Council game data
 */

function addMonths(date, months) {
    date = new Date(date);
    var d = date.getDate();
    date.setMonth(date.getMonth() + months);
    if (date.getDate() != d) {
      date.setDate(0);
    }
    return date;
}

d3.linegraph = function(noTicks, noDots, parties, partyColors, partyNames, dataMax, dataMin, additionalMonths) {
    /* params with defaults */
    if (!parties) {
        parties = ['spd', 'kpd', 'ddp', 'z', 'dvp', 'dnvp', 'nsdap', 'other'];
    }
    if (!partyColors) {
        partyColors = {'spd': '#E3000F', 'kpd': '#700000', 'ddp': '#D3C24D', 'z': '#000', 'dvp': '#D5AC27', 'dnvp': '#3E88B3', 'nsdap': '#7A3C00', 'other': '#a0a0a0'};
    }
    if (!partyNames) {
        partyNames = {'spd': 'SPD', 'kpd': 'KPD', 'ddp': 'DDP', 'z': 'Z + BVP', 'dvp': 'DVP', 'dnvp': 'DNVP', 'nsdap': 'NSDAP', 'other': 'Others'};
    }
    if (!additionalMonths) {
        additionalMonths = 10;
    }

    // Declare the chart dimensions and margins.
    var width = 500;
    var height = 300;
    var marginTop = 15;
    var marginRight = 20;
    var marginBottom = 40;
    var marginLeft = 35;

    function linegraph(dataset) {
        dataset.each(function(data) {
            // Ensure data is an array
            if (!Array.isArray(data)) {
                data = [data];
            }
            
            // Filter out empty data points
            data = data.filter(function(d) { 
                return d && d.date && typeof d.date === 'string'; 
            });
            
            if (data.length === 0) {
                d3.select(this).append("text")
                    .attr("x", width/2)
                    .attr("y", height/2)
                    .attr("text-anchor", "middle")
                    .attr("fill", "#888")
                    .attr("font-size", "12px")
                    .text("No data available");
                return;
            }

            var svg = d3.select(this);
            svg.selectAll("*").remove(); // Clear previous content
            
            // Parse dates
            const dates = data.map(function(d) { return new Date(d.date); });
            
            // Map the data to an array of arrays of {x, y} tuples
            const series = parties.map(function(party) {
                return data.map(function(d) {
                    return {'x': new Date(d.date), 'y': d[party] || 0, 'series': party};
                });
            });

            // Declare the x (horizontal position) scale
            const maxDate = d3.max(dates);
            const minDate = new Date(1928, 0);
            const xScale = d3.scaleUtc([minDate, addMonths(maxDate, additionalMonths)], [marginLeft, width - marginRight]);

            // Configure x-axis
            var xaxis = d3.axisBottom()
                .tickFormat(d3.timeFormat('%b %Y'))
                .tickValues(dates)
                .scale(xScale);
            if (noTicks) {
                xaxis = d3.axisBottom()
                    .tickFormat(d3.timeFormat('%b %Y'))
                    .ticks(Math.min(10, dates.length))
                    .scale(xScale);
            }

            // Declare the y (vertical position) scale
            if (!dataMax) {
                var allValues = [];
                parties.forEach(function(party) {
                    data.forEach(function(d) {
                        if (d[party] !== undefined && d[party] !== null) {
                            allValues.push(d[party]);
                        }
                    });
                });
                var overallMax = d3.max(allValues) || 10;
                dataMax = Math.max(overallMax + 10, 10);
                dataMin = 0;
            }
            const yScale = d3.scaleLinear([dataMin, dataMax], [height - marginBottom, marginTop]);

            // Add background rectangle
            svg.append("rect")
                .attr("x", 0)
                .attr("y", 0)
                .attr("width", width)
                .attr("height", height)
                .attr("fill", "transparent");

            // Add the x-axis
            svg.append("g")
                .attr("transform", "translate(0," + (height - marginBottom) + ")")
                .call(xaxis)
                .selectAll("text")
                .attr("text-anchor", "end")
                .attr("dx", "-0.8em")
                .attr("dy", "0.1em")
                .attr("transform", "rotate(-30)")
                .style("font-size", "9px");

            // Add the y-axis
            svg.append("g")
                .attr("transform", "translate(" + marginLeft + ",0)")
                .call(d3.axisLeft(yScale).ticks(5))
                .style("font-size", "9px");

            // Create line generator
            const partyLine = function(party) {
                return d3.line()
                    .x(function(d) { return xScale(new Date(d.date)); })
                    .y(function(d) { return yScale(d[party] || 0); });
            };

            // Draw the lines
            for (var i = 0; i < parties.length; i++) {
                var party = parties[i];
                var color = partyColors[party] || '#999';
                var isActive = data.some(function(d) { return d[party] !== undefined && d[party] !== null && d[party] > 0; });
                
                if (!isActive) continue;
                
                svg.append("path")
                    .attr("fill", "none")
                    .attr("stroke", color)
                    .attr("stroke-width", party === 'ZMP' ? 2.5 : 1.5)
                    .attr("opacity", party === 'ZMP' ? 1 : 0.7)
                    .attr("class", party + " party-line")
                    .attr("id", party + "-line")
                    .attr("series", party)
                    .attr("d", partyLine(party)(data))
                    .on("mouseover", function(d) {
                        var partyName = this.getAttribute('series') || party;
                        d3.selectAll(".party-line").attr("stroke-width", 0.5);
                        d3.selectAll(".party-node").attr("fill-opacity", 0.15);
                        d3.selectAll(".party-label").attr("opacity", 0.15);
                        d3.selectAll("." + partyName + "-node").attr("fill-opacity", 1);
                        d3.selectAll("." + partyName + "-label").attr("opacity", 1);
                        d3.select(this).attr("stroke-width", 4);
                    })
                    .on("mouseout", function(d) {
                        d3.selectAll(".party-line").attr("stroke-width", function() {
                            return this.getAttribute('class') && this.getAttribute('class').indexOf('ZMP') !== -1 ? 2.5 : 1.5;
                        });
                        d3.selectAll(".party-node").attr("fill-opacity", 1);
                        d3.selectAll(".party-label").attr("opacity", 1);
                    });
            }

            // Draw nodes (if noDots is false)
            if (!noDots) {
                var z = d3.scaleOrdinal(d3.schemeCategory10);
                svg.selectAll(".series")
                    .data(series)
                    .enter().append("g")
                    .selectAll(".point")
                    .data(function(d) { return d; })
                    .enter().append("circle")
                    .attr("class", function(d) { 
                        return d.series + " " + d.series + "-node party-node"; 
                    })
                    .attr("fill", function(d) { 
                        return partyColors[d.series] || '#999'; 
                    })
                    .attr("series", function(d) { return d.series; })
                    .attr("r", 3)
                    .attr("cx", function(d) { return xScale(d.x); })
                    .attr("cy", function(d) { return yScale(d.y); })
                    .on("mouseover", function(d) {
                        var node = d3.select(this);
                        var series = node.attr('series');
                        d3.selectAll(".party-line").attr("stroke-width", 0.5);
                        d3.selectAll(".party-node").attr("fill-opacity", 0.15);
                        d3.selectAll(".party-label").attr("opacity", 0.15);
                        d3.selectAll("." + series + "-node").attr("fill-opacity", 1);
                        d3.selectAll("#" + series + "-line").attr("stroke-width", 4);
                        d3.selectAll("." + series + "-label").attr("opacity", 1);
                    })
                    .on("mouseout", function(d) {
                        d3.selectAll(".party-line").attr("stroke-width", function() {
                            return this.getAttribute('class') && this.getAttribute('class').indexOf('ZMP') !== -1 ? 2.5 : 1.5;
                        });
                        d3.selectAll(".party-node").attr("fill-opacity", 1);
                        d3.selectAll(".party-label").attr("opacity", 1);
                    });
            }

            // Draw right-hand labels
            svg.selectAll(".labels")
                .data(series)
                .enter().append("text")
                .text(function(s) { 
                    var name = partyNames[s[0].series] || s[0].series;
                    return name;
                })
                .attr("series", function(s) { return s[0].series; })
                .attr("font-size", "9px")
                .attr("font-weight", function(s) { return s[0].series === 'ZMP' ? '700' : '400'; })
                .attr("class", function(s) { 
                    return s[0].series + "-label party-label"; 
                })
                .attr("x", function(s) { 
                    var last = s[s.length - 1];
                    return xScale(last.x) + 15; 
                })
                .attr("y", function(s) { 
                    var last = s[s.length - 1];
                    return yScale(last.y) + 4; 
                })
                .attr("fill", function(s) { 
                    return partyColors[s[0].series] || '#999'; 
                })
                .on("mouseover", function(d) {
                    var text = d3.select(this);
                    var series = text.attr('series');
                    d3.selectAll(".party-line").attr("stroke-width", 0.5);
                    d3.selectAll(".party-node").attr("fill-opacity", 0.15);
                    d3.selectAll(".party-label").attr("opacity", 0.15);
                    d3.selectAll("." + series + "-node").attr("fill-opacity", 1);
                    d3.selectAll("#" + series + "-line").attr("stroke-width", 4);
                    d3.selectAll("." + series + "-label").attr("opacity", 1);
                })
                .on("mouseout", function(d) {
                    d3.selectAll(".party-line").attr("stroke-width", function() {
                        return this.getAttribute('class') && this.getAttribute('class').indexOf('ZMP') !== -1 ? 2.5 : 1.5;
                    });
                    d3.selectAll(".party-node").attr("fill-opacity", 1);
                    d3.selectAll(".party-label").attr("opacity", 1);
                });
        });
    }

    // Chainable setters
    linegraph.width = function(value) {
        if (!arguments.length) return width;
        width = value;
        return linegraph;
    };

    linegraph.height = function(value) {
        if (!arguments.length) return height;
        height = value;
        return linegraph;
    };

    linegraph.parties = function(value) {
        if (!arguments.length) return parties;
        parties = value;
        return linegraph;
    };

    linegraph.partyNames = function(value) {
        if (!arguments.length) return partyNames;
        partyNames = value;
        return linegraph;
    };

    linegraph.partyColors = function(value) {
        if (!arguments.length) return partyColors;
        partyColors = value;
        return linegraph;
    };

    // New method to update data dynamically
    linegraph.updateData = function(newData) {
        return linegraph;
    };

    return linegraph;
};