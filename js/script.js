var Datastore = require('nedb'),db = new Datastore({ filename: 'db/data.db', autoload: true });
const fs = require('fs');
const {dialog} = require('electron').remote;
const XLSX = require('xlsx');
var json_global;

$(document).ready(function(){
    pricing_view();shipping_view();etr_view();cost_view();
})

$('#multiple_checkbox').click(function(){
    if($(this).prop('checked') == true){
        $('#multiple_div').show();
        return;
    }
    $('#multiple_div').hide();
})

function upload(){
    dialog.showOpenDialog({ filters: [{ name: 'excel', extensions: ['xlsx'] }]},(fileNames) => {
    if(fileNames === undefined){
        return;
    }
    filepath = fileNames[0];
    fs.readFile(filepath, 'utf8', (err, data) => {
        if(err){
            return;
        }
        if(filepath == ""){
            return;
        }
        calculate(filepath);
        });
    });
}

var get_all_channels = function() {
    return new Promise((resolve, reject)=> {
        db.find({type:'pricing'},{channel_name:1},function(err,docs){
        if(err) {
            reject(err);
            return;
        }
        var c = [];
        for(var o of docs){
            if(c.indexOf(o['channel_name']) == -1)
                c.push(o['channel_name']);
        }
        resolve(c);
    })
    })
}

var get_pricing = function(ch_name,brand_name){
    return new Promise((resolve,reject)=>{
        db.findOne({type:'pricing',channel_name:ch_name,brand:brand_name},function(err,pricing_docs){
            if(pricing_docs == null){
                reject(err);
                return;
            }
            var percent = parseFloat(pricing_docs['percentage']),etr = false,m=10;
            if(pricing_docs.hasOwnProperty('exchange') || pricing_docs.hasOwnProperty('tax'))
                etr = true;
            if(pricing_docs.hasOwnProperty('multiple'))
                m = parseFloat(pricing_docs['multiple'])
            resolve([percent,etr,m]);
    })
})
}

var get_cost = function(ch_name,cost){
    return new Promise((resolve,reject) =>{
        db.find({type:'cost',channel_name:ch_name},function(err,cost_docs){
            if(cost_docs == null){
                reject(err);
                return;
            }
            var percent = 0;
            for(var d of cost_docs)
                if(cost >= parseFloat(d['min_cost_cost']) && cost < parseFloat(d['max_cost_cost']))
                        percent = parseFloat(d['percent_cost']);
            resolve(percent);
        })
    })
}

var get_shipping = function(ch_name,cost){
    return new Promise((resolve,reject) => {
        db.find({type:'shipping',channel_name:ch_name},function(err,shipping_docs){
            if(shipping_docs == null){
                reject(err);
                return;
            }
            var extra_cost = 0;
            for(var d of shipping_docs)
                if(cost >= parseFloat(d['min_cost']) && cost < parseFloat(d['max_cost']))
                    extra_cost = parseFloat(d['extra_cost']);
            resolve(extra_cost);
        })
    })
}

var get_etr = function(ch_name){
    return new Promise((resolve,reject) => {
        db.findOne({type:'etr',channel_name:each_channel},function(err,etr_docs){
            if(etr_docs == null){
                reject(err);
                return;
            }
            var etr_ex = etr_tx = 1;
            if(etr_docs.hasOwnProperty('exchange_rate') && etr_docs.hasOwnProperty('tax_rate')){
                etr_ex = parseFloat(etr_docs['exchange_rate']);
                etr_tx = etr_docs['tax_rate'];
                resolve([etr_ex,etr_tx]);
                return;
            }
            else if(etr_res.hasOwnProperty('exchange_rate')){
                etr_ex = parseFloat(etr_docs['exchange_rate']);
                resolve([etr_ex,etr_tx]);
                return;
            }
            else{
                etr_tx = parseFloat(etr_docs['tax_rate']);
                resolve([etr_ex,etr_tx]);
                return;
            
            }
        })
    })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function calculate(filepath){
    var wb = XLSX.readFile(filepath);
    var ws = wb.Sheets[wb.SheetNames[0]];
    json_global = XLSX.utils.sheet_to_json(ws);
    var channel_arr = await get_all_channels();
    var count = 1;
    if(json_global.length == 0){
        fill_p('upload_p','warning','No Data in the input file');
        return;
    }
    if(channel_arr.length == 0){
        fill_p('upload_p','warning','No Channels found to calculate pricing');
        return;
    }
    $('#progress_wrapper').show();
    $('#progress').css('width','0%');
    for(var obj of json_global){
        await sleep(100);
        delete obj['Consignment'];
        delete obj['Warehouse'];
        for(var each_channel of channel_arr){
            var p_result;
            try{
                p_result = await get_pricing(each_channel,obj['Brand']);
            }
            catch(err){
                try{
                    p_result = await get_pricing(each_channel,'Other');
                }
                catch(err){
                    obj[each_channel] = 'NA';
                    continue;
                }
            }
            try{
                var temp = await get_cost(each_channel,parseFloat(obj['CostUSD']));
                if(temp != 0)
                    p_result[0] = temp;
            }
            catch(err){}
            var cost = parseFloat(obj['CostUSD']) * p_result[0] + parseFloat(obj['CostUSD']);
            try{
                cost += await get_shipping(each_channel,parseFloat(obj['CostUSD']));
            }
            catch(err){}
            if(p_result[1]){
                try{
                    cost *= multiply(await get_etr(each_channel));
                }
                catch(err){}
            }
            if(p_result[2] == 10)
                obj[each_channel] = Math.ceil(cost);
            else
                obj[each_channel] = Math.ceil(cost / m) * m;
            delete obj['CostUSD'];
        }        
        $('#progress').css('width',parseInt(count / json_global.length * 100) + '%');
        $('#progress').html(parseInt(count / json_global.length * 100) + '% Complete');
        count +=1;
    }
    $('#save').show();
}

function save(){
    var ws = XLSX.utils.json_to_sheet(json_global);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Pricing Result');
    dialog.showSaveDialog({ filters: [
     { name: 'excel', extensions: ['xlsx'] }]},function(path){
        try{
            if(path.split('.').pop() !== 'xlsx'){
                fill_p('upload_p','warning','Save unsuccessful. Please give extension as only "xlsx"');
                return;
            }
            XLSX.writeFile(wb,path);
            if(path.indexOf('\\') > -1){
                fill_p('upload_p','success','File Saved Successfully to ' + path.substring(0,path.lastIndexOf("\\")));
                return;
            }
            else if(path.indexOf('/') > -1){
                fill_p('upload_p','success','File Saved Successfully to ' + path.substring(0,path.lastIndexOf("/")));
                return;
            }
            else{
                fill_p('upload_p','success','File Saved Successful');
                return;
            }
            
        }
        catch(err){
            fill_p('upload_p','warning','Save unsuccessful');
        }
    })
}

function pricing_view(){
    $('#view_select_channel').empty();
    db.find({type:'pricing'},{channel_name:1,_id: 0},function(err,data){
        var channels = [],chan_temp = '';
        data.forEach(function(element) {
            if($.inArray(element['channel_name'],channels) == -1)
                channels.push(element['channel_name']);
        }, this);
        var select_channel = document.getElementById('view_select_channel');
        for(var chan of channels){
            option = document.createElement( 'option' );
            option.value = chan;
            option.innerHTML = chan;
            select_channel.add(option);
        }
        $('#view_select_channel').addClass('selectpicker');
        $('#view_select_channel').attr('data-live-search', 'true','multiple','multiple');
        $('#view_select_channel').selectpicker('refresh');
    })
}

function delete_pricing(){
    $('#delete_pricing_p').html("");
    if($('#delete_pricing_brand').val().trim() == "" || $('#delete_pricing_channel').val().trim() == ""){
        fill_p('delete_pricing_p','warning','Do not leave empty fields');
        return;
    }
    db.find({type:'pricing',channel_name:$('#delete_pricing_channel').val().trim(),brand:$('#delete_pricing_brand').val().trim()},function(err,docs){
        if(docs.length == 0){
            fill_p('delete_pricing_p','warning','No such Channel or Brand Found')
            return;
        }
        db.remove({type:'pricing',channel_name:$('#delete_pricing_channel').val().trim(),brand:$('#delete_pricing_brand').val().trim()},{multi:true},function(err,numdata){
        if(err){
            fill_p('delete_pricing_p','warning','Pricing Formula Deletion Failed');
            return;
        }
        else{
            fill_p('delete_pricing_p','success','Pricing Formula deleted successfully');
        }
    })
})    
}

function add_new_pricing(){
    var data = get_data();
    if(data == false)
        return;
    db.insert(data,function(err,new_data){
        $('#fail').show();
        if(err){
            if(err['errorType'] == 'uniqueViolated'){
                fill_p('fail','warning','<b>Pricing for ' + data['brand'] + ' in ' + data['channel_name'] + ' already there. Operations allowed are update and delete</b>');
                return;
            }
        }
        else{
            fill_p('fail','success','<b>New Pricing added</b>');
            $('#new_pricing_form :input:not([type=checkbox])').val('');
        }
    })
}

function update_pricing(){
    var data = get_data();
    if(data == false)
        return;
    db.find({_id:data['_id']},function(err,res){
        $('#fail').show();
        if(res.length > 0){
            db.remove({_id:data['_id']},{multi:true},function(err,num_rows){
                if(num_rows > 0){
                    db.insert(data,function(err,res){
                        if(err){
                            fill_p('fail','error','Updation Failed');
                            return;
                        }
                        else{
                            fill_p('fail','success','Update Successful');
                            $('#new_pricing_form :input:not([type=checkbox])').val('');
                            return;
                        }
                    })
                }
                else{
                    fill_p('fail','error','Updation Failed');
                    return;
                }
            })
        }
        else{
            fill_p('fail','warning','No such Channel Found. Consider adding as a new channel');
            return;
        }
    })
}

function check(){
    if($('#channel_name').val().trim() == ""){
        $('#result_formula').html('*Please Enter a Channel Name');
        return false;
    }
    if($('#brand').val().trim() == ""){
       $('#result_formula').html('*Please Enter a Brand Name');
        return false;
    }
    return true;
}

function populate(){
    if(!check())
        return;
    update();
}

function update(){
    var temp = 'The pricing for <b> ' + $('#channel_name').val().trim() + '</b> and <b> ' + $('#brand').val().trim() + '</b> is : <b>';
    temp += 'Ceiling('
    var m = 10;
    if($('#multiple_checkbox').is(":checked")){
        if($('#multiple').val() == "")
            m = 10
        else
            m = $('#multiple').val()
    }
    if($('#percentage').val() == "")
        temp += '(Cost * (1 + Percentage Rate) + Shipping)';
    else
        temp += '(Cost * ' + (1+parseFloat($('#percentage').val())) + ' + Shipping)';
    if($('#exchange_checkbox').prop("checked"))
        temp += ' * Exchange Rate';
    if($('#tax_checkbox').prop("checked"))
        temp += ' * Tax Rate';
    $('#result_formula').html(temp + ', '+ m+')'+ '</b>');
}

$("#percentage,#channel_name,#brand,#multiple").bind('keyup mouseup', function () {
    populate();
});

$("#exchange_checkbox,#tax_checkbox,#multiple_checkbox").click(function(){
    populate();
});

$("#min_cost,#max_cost,#extra_cost").bind('keyup mouseup', function () {
    shipping_populate();
});

function shipping_populate(){
    if($('#channel_shipping').val().trim() == ""){
        $('#result_shipping').html('*Please enter the Channel Name');
        return;
    }
    var temp = 'Any Price greater than <b> $';
    if($('#min_cost').val() == "")
        temp += '(Min_Cost)</b> and lesser than <b>$';
    else
        temp += $('#min_cost').val() + '</b> and lesser than <b>$';    
    if($('#max_cost').val() == "")
        temp += '(Max_Cost)</b> in <b>'+ $('#channel_shipping').val().trim() + '</b> will be charged an extra cost of <b>$';
    else
        temp +=  $('#max_cost').val() + '</b> in <b>'+ $('#channel_shipping').val().trim()+  '</b> will be charged an extra cost of <b>$';
    if($('#extra_cost').val() == "")
        temp += '(Extra_Cost)</b> ';
    else
        temp +=  $('#extra_cost').val() + '</b>';
    $('#result_shipping').html(temp + '</b>');
}

function shipping_view(){
    $("#shipping_rules > tbody").html("");
    db.find({type:'shipping'},{_id:0},function(err,data){
        data.forEach(function(item){
            $('#shipping_rules tbody').append('<tr><td class="text-center">' + item['channel_name'] + '</td><td class="text-center">[' + item['min_cost'] + ',' + item['max_cost'] + ') </td><td class="text-center">' + item['extra_cost'] + '</td></tr>')
        },this)
    })
    $("#shipping_rules").show();
}

function cost_view(){
    $("#cost_rules > tbody").html("");
    db.find({type:'cost'},{_id:0},function(err,data){
        data.forEach(function(item){
            $('#cost_rules tbody').append('<tr><td class="text-center">' + item['channel_name'] + '</td><td class="text-center">[' + item['min_cost_cost'] + ',' + item['max_cost_cost'] + ') </td><td class="text-center">' + item['percent_cost'] + '</td></tr>')
        },this)
    })
    $("#cost_rules").show();
}

function fill_p(name,new_class,text){
    $('#' + name ).removeClass();
    switch (new_class) {
        case "warning":
        $('#' + name ).addClass('alert alert-warning');
        break;
        case 'success':
        $('#' + name ).addClass('alert alert-success');
        break;
        case 'error':
        $('#' + name ).addClass('alert alert-error');
        break;
    }
    $('#' + name).html('<b>' + text + '</b>');
    $('#' + name).show();
}

function get_data(){
    var data = {};
    $("#new_pricing_form :input[type='text']").each(function(){
        if($(this).val().trim() == ""){
            fill_p('fail','warning','Do not leave the fields empty');
            temp = false;
            return false;
        }
        data[$(this).prop('id')] = $(this).val();
    });
    var percentage = $('#percentage').val();
    if($('#multiple_checkbox').is(":checked")){
        if($('#multiple').val() == ""){
            fill_p('fail','warning','Do not leave the fields empty');
            return;
        }
        else
            data['multiple'] = $('#multiple').val()
    }
    if(percentage == "" || multiple == ""){
        fill_p('fail','warning','Do not leave the fields empty');
        return;
    }
    data['percentage'] = percentage;
    if($('#exchange_checkbox').prop('checked'))
        data['exchange'] = true;
    if($('#tax_checkbox').prop('checked'))
        data['tax'] = true;
    data['_id'] = 'pricing' + data['channel_name'].toLowerCase() + data['brand'].toLowerCase();
    data['type'] = 'pricing';
    return data;
}

function search(){
    $("#table_view_search > tbody").html("");
    db.find({type:'pricing',channel_name : $('#view_select_channel').val()},{_id:0},function(err,data){
        data.forEach(function(res){
            var m = 10;
            var temp = '<tr><td class="text-center">' + res['brand'] + '</td><td class="text-center">Ceiling((Cost * ' + (1+parseFloat(res['percentage'])) + ' + Shipping)'
            if(res.hasOwnProperty('exchange'))
                temp += ' * Exchange Rate'
            if(res.hasOwnProperty('tax'))
                temp += ' * Tax Rate'
            if(res.hasOwnProperty('multiple'))
                m = parseFloat(res['multiple'])
        $('#table_view_search tbody').append( temp + ', ' + m + ')' + '</td></tr>');
        },this)
    })
    $('#table_view_search').show();
}

function add_shipping_rule(){
    var data = {};
    var temp = true;
    if(parseFloat($('#min_cost').val()) > parseFloat($('#max_cost').val())){
        $('#result_shipping').html('*Maximum Cost cannot be less than Minimum Cost');
        return;
    }
    $("#new_shipping_form :input").each(function(){
        if($(this).val().trim() == ""){
            fill_p('shipping_p','warning','Do not leave the fields empty');
            temp = false;
            return false;
        }
        data[$(this).prop('id')] = $(this).val();
    });
    if(!temp)
        return;
    data['channel_name'] = data['channel_shipping'];
    delete data['channel_shipping'];
    data['type'] = 'shipping';
    data['min_cost'] = data['min_cost'];
    data['max_cost'] = data['max_cost'];
    data['extra_cost'] = data['extra_cost'];
    db.insert(data,function(err,new_data){
        if(err){
            fill_p('shipping_p','warning','Error');
            return;
        }
        else{
            fill_p('shipping_p','success','New Shipping Rule added');
        }
    })
    $('#new_shipping_form')[0].reset();
}

function add_cost_constraint(){
    var data = {};
    var temp = true;
    if(parseFloat($('#min_cost_cost').val()) > parseFloat($('#max_cost_cost').val())){
        $('#result_cost').html('*Maximum Cost cannot be less than Minimum Cost');
        return;
    }
    $("#new_cost_form :input").each(function(){
        if($(this).val().trim() == ""){
            fill_p('cost_p','warning','Do not leave the fields empty');
            temp = false;
            return false;
        }
        data[$(this).prop('id')] = $(this).val();
    });
    if(!temp)
        return;
    data['channel_name'] = data['channel_cost'];
    delete data['channel_cost'];
    data['type'] = 'cost';
    data['min_cost_cost'] = data['min_cost_cost'];
    data['max_cost_cost'] = data['max_cost_cost'];
    data['percent_cost'] = data['percent_cost'];
    db.insert(data,function(err,new_data){
        if(err){
            if(err['errorType'] == 'uniqueViolated'){
                fill_p('cost_p','warning','Cost Constraint already there');
                return;
            }
        }
        else{
            fill_p('cost_p','success','New Cost Constraint added');
        }
    })
    $('#new_cost_form')[0].reset();
}

function delete_cost_constraint(){
    $('#delete_cost_p').html("");
    var ch_val = $('#channel_delete_cost').val().trim();
    if(ch_val == ""){
        $('#delete_cost_p').html("Enter the Channel Name");
        return;
    }
    db.find({type:'cost',channel_name:ch_val},function(err,docs){
        if(docs.length == 0){
            fill_p('delete_cost_p','warning','No such Channel Found');
            return;
        }
        db.remove({type:'cost',channel_name:ch_val},{multi:true},function(err,numdata){
        if(err){
            fill_p('delete_cost_p','warning','Cost Constraint Deletion Failed');
            return;
        }
        else{
            fill_p('delete_cost_p','success','Cost Constraint deleted successfully');
        }
    })
})    
}

function delete_shipping_rule(){
    $('#delete_shipping_p').html("");
    var ch_val = $('#channel_delete').val().trim();
    if(ch_val == ""){
        $('#delete_shipping_p').html("Enter the Channel Name");
        return;
    }
    db.find({type:'shipping',channel_name:ch_val},function(err,docs){
        if(docs.length == 0){
            fill_p('delete_shipping_p','warning','No such Channel Found');
            return;
        }
        db.remove({type:'shipping',channel_name:ch_val},{multi:true},function(err,numdata){
        if(err){
            fill_p('delete_shipping_p','warning','Shipping Rule Deletion Failed');
            return;
        }
        else{
            fill_p('delete_shipping_p','success','Shipping Rule deleted successfully');
        }
    })
})    
}

function etr_search(){
    $("#table_view_search_etr > tbody").html("");
    db.find({type:'etr',channel_name : $('#view_select_channel_etr').val()},{_id:0},function(err,data){
        data.forEach(function(res){
            var temp = '<tr><td class="text-center">' + res['channel_name'] + '</td>';
            if(res.hasOwnProperty('exchange_rate'))
                temp += '<td class="text-center">'+ res['exchange_rate'] + '</td>';
            else
                temp += '<td class="text-center">NA</td>';
            if(res.hasOwnProperty('tax_rate'))
                temp += '<td class="text-center">'+ res['tax_rate'] + '</td>';
            else
                temp += '<td class="text-center">NA</td>';
        $('#table_view_search_etr tbody').append( temp + '</td></tr>');
        },this)
    })
    $('#table_view_search_etr').show();
}

function etr_view(){
    $('#view_select_channel_etr').empty();
    db.find({type:'etr'},{channel_name:1, _id: 0},function(err,data){
        var channels = [],chan_temp = '';
        data.forEach(function(element) {
            if($.inArray(element['channel_name'],channels) == -1)
                channels.push(element['channel_name'])
        }, this);
        var select_channel = document.getElementById('view_select_channel_etr');
        for(var chan of channels){
            option = document.createElement( 'option' );
            option.value = chan;
            option.innerHTML = chan;
            select_channel.add(option);
        }
        $('#view_select_channel_etr').addClass('selectpicker');
        $('#view_select_channel_etr').attr('data-live-search', 'true','multiple','multiple');
        $('#view_select_channel_etr ').selectpicker('refresh');
    })
}

function add_etr(){
    if($('#channel_etr').val().trim() == ""){
        fill_p('etr_p','warning','Please Enter the Channel Name');
        return;
    }
    if($('#exchange_rate').val() == "" && $('#tax_rate').val() == ""){
        fill_p('etr_p','warning','DO NOT ADD IF EXCHANGE OR TAX RATE IS NOT NEEDED');
        return;
    }
    var data = {};
    data['type'] = 'etr';
    data['channel_name'] = $('#channel_etr').val().trim();
    if($('#exchange_rate').val() == ""){
        data['tax_rate'] = $('#tax_rate').val();
    }
    else if($('#tax_rate').val() == ""){
        data['exchange_rate'] = $('#exchange_rate').val();
    }
    else{
        data['tax_rate'] = $('#tax_rate').val();
        data['exchange_rate'] = $('#exchange_rate').val();
    }
    data['_id'] = 'etr' + data['channel_name'];
    db.insert(data,function(err,res){
        if(err){
            fill_p('etr_p','warning','Exchange and Tax Rate already exists. To update,delete and add.');
            return;
        }
        fill_p('etr_p','success','Exchange and Tax Rate for the channel "' + data['channel_name'] + '" added');
        $('#etr_add_form')[0].reset();
        return;
    })
}

function delete_etr(){
    if($('#channel_etr_delete').val().trim() == ""){
        fill_p('etr_p_delete','warning','Please Enter the Channel Name');
        return;
    }
    var data={type:'etr',channel_name:$('#channel_etr_delete').val().trim()};
    db.find(data,function(err,docs){
        if(docs.length == 0){
            fill_p('etr_p_delete','warning','No such Channel Found');
            return;
        }
        db.remove(data,{multi:true},function(err,numdata){
        if(err){
            fill_p('etr_p_delete','warning','Exchange and Tax Rule Deletion Failed');
            return;
        }
        else{
            fill_p('etr_p_delete','success','Exchange and Tax Rule deleted successfully');
            $('#etr_delete_form')[0].reset();
            return;
        }
    })
})
}